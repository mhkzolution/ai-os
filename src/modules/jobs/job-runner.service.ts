import { Injectable } from '@nestjs/common';
import type {
  Execution,
  Job,
  Prisma,
  Task,
} from '../../../generated/prisma/client';
import { ExecutionStatus, JobStatus } from '../../../generated/prisma/enums';
import { AiProviderFactory } from '../../shared/ai/ai-provider.factory';
import type { AIResponse } from '../../shared/ai/ai-response';
import {
  ProviderTimeoutError,
  withProviderTimeout,
} from '../../shared/ai/provider-timeout';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { JOB_MAX_ATTEMPTS } from '../../shared/queue/queue.constants';
import { CostsService } from '../costs/costs.service';
import { TaskRegistry } from '../tasks/registry/task.registry';
import { TaskOutputInvalidError } from '../tasks/task-output-invalid.error';
import { UsageService } from '../usage/usage.service';
import { ExecutionFailed } from './execution-error';
import type { JobRunner } from './job-runner';
import { ProviderResolveError } from './provider-resolve';
import { ProviderResolver } from './provider-resolver.service';

type JobWithTask = Job & { task: Task };

@Injectable()
export class JobRunnerService implements JobRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskRegistry: TaskRegistry,
    private readonly providerResolver: ProviderResolver,
    private readonly aiFactory: AiProviderFactory,
    private readonly usage: UsageService,
    private readonly costs: CostsService,
  ) {}

  async run(jobId: string): Promise<void> {
    const existing = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { task: true },
    });
    if (!existing) {
      return;
    }
    if (
      existing.status === JobStatus.COMPLETED ||
      existing.status === JobStatus.FAILED
    ) {
      return;
    }
    if (existing.status === JobStatus.PENDING) {
      const claimed = await this.prisma.job.updateMany({
        where: { id: jobId, status: JobStatus.PENDING },
        data: { status: JobStatus.PROCESSING },
      });
      if (claimed.count === 0) {
        return;
      }
    }

    const job = existing;
    const attempt =
      (await this.prisma.execution.count({ where: { jobId } })) + 1;
    const startedAt = new Date();
    const execution = await this.prisma.execution.create({
      data: {
        jobId,
        attempt,
        status: ExecutionStatus.PROCESSING,
        input: job.input as Prisma.InputJsonValue,
        requestId: job.requestId,
        startedAt,
      },
    });

    try {
      await this.executeAttempt(job, execution, startedAt);
    } catch (error) {
      const failed = this.mapError(error);
      await this.failExecution(execution.id, failed, startedAt);
      if (!failed.retryable || attempt >= JOB_MAX_ATTEMPTS) {
        await this.failJob(job.id, failed);
      }
      if (failed.retryable) {
        throw error;
      }
    }
  }

  private async executeAttempt(
    job: JobWithTask,
    execution: Execution,
    startedAt: Date,
  ) {
    const definition = this.taskRegistry.get(job.task.code);
    const promptKey = job.task.promptKey || definition.promptKeyDefault;
    const prompt = await this.prisma.prompt.findFirst({
      where: { key: promptKey, isActive: true },
    });
    if (!prompt) {
      throw new ExecutionFailed(
        'NO_PROMPT',
        'CONFIG',
        false,
        `No active prompt for key ${promptKey}`,
      );
    }

    let resolved: Awaited<ReturnType<ProviderResolver['resolve']>>;
    try {
      resolved = await this.providerResolver.resolve(definition.purpose);
    } catch (error) {
      if (error instanceof ProviderResolveError) {
        throw new ExecutionFailed(
          error.code,
          'CONFIG',
          false,
          error.code === 'NO_PROVIDER'
            ? 'No active provider is configured'
            : 'No active model matches the task purpose',
        );
      }
      throw error;
    }

    const { provider, model } = resolved;
    const providerSnapshot = {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      priority: provider.priority,
    };
    const modelSnapshot = {
      id: model.id,
      name: model.name,
      purpose: model.purpose,
      inputPricePer1k: Number(model.inputPricePer1k),
      outputPricePer1k: Number(model.outputPricePer1k),
      currency: model.currency,
    };
    const promptSnapshot = {
      id: prompt.id,
      key: prompt.key,
      version: prompt.version,
    };

    await this.prisma.execution.update({
      where: { id: execution.id },
      data: {
        providerId: provider.id,
        modelId: model.id,
        providerSnapshot,
        modelSnapshot,
        promptSnapshot,
      },
    });

    const ai = this.aiFactory.get(provider);
    const images = (job.input as { images: string[] }).images;
    const response = await withProviderTimeout(
      (signal) =>
        definition.handler.execute(ai, {
          model: model.name,
          images,
          prompt: prompt.content,
          signal,
        }),
      this.aiFactory.timeoutMs(),
    );

    let output: unknown;
    try {
      output = definition.validateOutput(response.content);
    } catch (error) {
      if (error instanceof TaskOutputInvalidError) {
        throw new ExecutionFailed(
          'OUTPUT_INVALID',
          'VALIDATION',
          false,
          error.message,
          response.raw ?? response.content,
        );
      }
      throw error;
    }

    await this.recordUsageAndCost(
      job,
      execution,
      provider.id,
      model.id,
      modelSnapshot,
      response,
    );

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    await this.prisma.$transaction([
      this.prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          output: output as Prisma.InputJsonValue,
          rawResponse: response.raw as Prisma.InputJsonValue,
          completedAt,
          durationMs,
        },
      }),
      this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          output: output as Prisma.InputJsonValue,
          completedAt,
        },
      }),
    ]);
  }

  private async recordUsageAndCost(
    job: JobWithTask,
    execution: Execution,
    providerId: string,
    modelId: string,
    modelSnapshot: {
      inputPricePer1k: number;
      outputPricePer1k: number;
      currency: string;
    },
    response: AIResponse,
  ) {
    const usage = await this.usage.record({
      clientId: job.clientId,
      providerId,
      modelId,
      taskId: job.taskId,
      jobId: job.id,
      executionId: execution.id,
      tokensInput: response.tokensInput,
      tokensOutput: response.tokensOutput,
      requestId: job.requestId,
    });
    await this.costs.recordFromUsage(
      usage,
      {
        inputPricePer1k: modelSnapshot.inputPricePer1k,
        outputPricePer1k: modelSnapshot.outputPricePer1k,
      },
      modelSnapshot.currency,
    );
  }

  private mapError(error: unknown): ExecutionFailed {
    if (error instanceof ExecutionFailed) {
      return error;
    }
    if (error instanceof TaskOutputInvalidError) {
      return new ExecutionFailed(
        'OUTPUT_INVALID',
        'VALIDATION',
        false,
        error.message,
        error.rawResponse,
      );
    }
    if (error instanceof ProviderTimeoutError) {
      return new ExecutionFailed(
        error.code,
        error.category,
        error.retryable,
        error.message,
      );
    }
    return new ExecutionFailed(
      'INTERNAL',
      'SYSTEM',
      false,
      'Internal worker error',
    );
  }

  private async failExecution(
    executionId: string,
    failed: ExecutionFailed,
    startedAt: Date,
  ) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.FAILED,
        error: failed.toJson(),
        rawResponse:
          failed.rawResponse === undefined
            ? undefined
            : (failed.rawResponse as Prisma.InputJsonValue),
        vendorError:
          failed.vendorError === undefined
            ? undefined
            : (failed.vendorError as Prisma.InputJsonValue),
        completedAt,
        durationMs,
      },
    });
  }

  private async failJob(jobId: string, failed: ExecutionFailed) {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        error: failed.toJson(),
        completedAt: new Date(),
      },
    });
  }
}
