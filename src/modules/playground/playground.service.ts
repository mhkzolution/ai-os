import {
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Prisma } from '../../../generated/prisma/client';
import { ModelPurpose } from '../../../generated/prisma/enums';
import { AiProviderFactory } from '../../shared/ai/ai-provider.factory';
import {
  ProviderTimeoutError,
  withProviderTimeout,
} from '../../shared/ai/provider-timeout';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { calculateCost } from '../costs/cost.calculator';
import { CostsService } from '../costs/costs.service';
import { ProductAnalysisInput } from '../tasks/schemas/product-analysis.input';
import { UsageService } from '../usage/usage.service';
import { ExecutePlaygroundDto } from './dto/execute-playground.dto';

@Injectable()
export class PlaygroundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFactory: AiProviderFactory,
    private readonly usage: UsageService,
    private readonly costs: CostsService,
  ) {}

  async execute(
    userId: string,
    dto: ExecutePlaygroundDto,
    requestId: string,
  ) {
    const playground = await this.prisma.client.findUnique({
      where: { code: 'PLAYGROUND' },
    });
    if (!playground) {
      throw new NotFoundException('PLAYGROUND client is not seeded');
    }

    const prompt = await this.prisma.prompt.findUnique({
      where: { id: dto.promptId },
    });
    if (!prompt) {
      throw new NotFoundException(`Prompt ${dto.promptId} not found`);
    }

    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${dto.providerId} not found`);
    }

    const model = await this.prisma.model.findUnique({
      where: { id: dto.modelId },
    });
    if (!model || model.providerId !== provider.id) {
      throw new NotFoundException(`Model ${dto.modelId} not found`);
    }
    if (model.purpose !== ModelPurpose.VISION) {
      throw new UnprocessableEntityException(
        'Playground V1 supports VISION models only',
      );
    }

    const input = plainToInstance(ProductAnalysisInput, dto.input ?? {});
    if (validateSync(input).length > 0) {
      throw new UnprocessableEntityException(
        'images must be a non-empty array of urls',
      );
    }

    const snapshot = {
      inputPricePer1k: Number(model.inputPricePer1k),
      outputPricePer1k: Number(model.outputPricePer1k),
    };
    const ai = this.aiFactory.get(provider);
    const startedAt = Date.now();

    try {
      const response = await withProviderTimeout(
        (signal) =>
          ai.analyzeImage({
            model: model.name,
            images: input.images,
            prompt: prompt.content,
            signal,
          }),
        this.aiFactory.timeoutMs(),
      );
      const durationMs = Date.now() - startedAt;
      const estimatedCost = calculateCost(
        response.tokensInput,
        response.tokensOutput,
        snapshot,
      );
      const run = await this.prisma.playgroundRun.create({
        data: {
          userId,
          clientId: playground.id,
          providerId: provider.id,
          modelId: model.id,
          promptId: prompt.id,
          input: dto.input as Prisma.InputJsonValue,
          output: response.content as Prisma.InputJsonValue,
          rawResponse: response.raw as Prisma.InputJsonValue,
          tokensInput: response.tokensInput,
          tokensOutput: response.tokensOutput,
          estimatedCost,
          currency: model.currency,
          requestId,
          durationMs,
        },
      });
      const usage = await this.usage.record({
        clientId: playground.id,
        providerId: provider.id,
        modelId: model.id,
        playgroundRunId: run.id,
        tokensInput: response.tokensInput,
        tokensOutput: response.tokensOutput,
        requestId,
      });
      await this.costs.recordFromUsage(usage, snapshot, model.currency);
      return {
        output: response.content,
        rawResponse: response.raw,
        tokensInput: response.tokensInput,
        tokensOutput: response.tokensOutput,
        estimatedCost,
        currency: model.currency,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (error instanceof ProviderTimeoutError) {
        await this.prisma.playgroundRun.create({
          data: {
            userId,
            clientId: playground.id,
            providerId: provider.id,
            modelId: model.id,
            promptId: prompt.id,
            input: dto.input as Prisma.InputJsonValue,
            error: {
              code: error.code,
              category: error.category,
              message: error.message,
              retryable: error.retryable,
            },
            currency: model.currency,
            requestId,
            durationMs,
          },
        });
        throw new GatewayTimeoutException({
          error: 'PROVIDER_TIMEOUT',
          message: error.message,
        });
      }
      throw error;
    }
  }
}
