import { Injectable } from '@nestjs/common';
import type { UsageLog } from '../../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  record(params: {
    clientId: string;
    providerId: string;
    modelId: string;
    taskId?: string;
    jobId?: string;
    executionId?: string;
    playgroundRunId?: string;
    tokensInput: number;
    tokensOutput: number;
    requestId: string;
  }): Promise<UsageLog> {
    return this.prisma.usageLog.create({
      data: {
        clientId: params.clientId,
        providerId: params.providerId,
        modelId: params.modelId,
        taskId: params.taskId,
        jobId: params.jobId,
        executionId: params.executionId,
        playgroundRunId: params.playgroundRunId,
        tokensInput: params.tokensInput,
        tokensOutput: params.tokensOutput,
        requestId: params.requestId,
        requestCount: 1,
      },
    });
  }
}
