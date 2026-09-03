import { Injectable } from '@nestjs/common';
import type { UsageLog } from '../../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { ReportingQueryDto } from './dto/reporting-query.dto';
import {
  groupFields,
  groupKey,
  resolveGroupBy,
  usageReportWhere,
} from './usage-report';

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

  async report(query: ReportingQueryDto) {
    const groupBy = resolveGroupBy(query);
    const includePlayground = query.includePlayground === true;
    const rows = await this.prisma.usageLog.findMany({
      where: usageReportWhere(query),
    });
    const grouped = new Map<
      string,
      { tokensInput: number; tokensOutput: number; requestCount: number }
    >();
    for (const row of rows) {
      const key = groupKey(row, groupBy);
      const current = grouped.get(key) ?? {
        tokensInput: 0,
        tokensOutput: 0,
        requestCount: 0,
      };
      current.tokensInput += row.tokensInput;
      current.tokensOutput += row.tokensOutput;
      current.requestCount += row.requestCount;
      grouped.set(key, current);
    }
    const items = [...grouped.entries()].map(([key, value]) => ({
      ...groupFields(groupBy, key),
      ...value,
    }));
    const totals = items.reduce(
      (acc, item) => ({
        tokensInput: acc.tokensInput + item.tokensInput,
        tokensOutput: acc.tokensOutput + item.tokensOutput,
        requestCount: acc.requestCount + item.requestCount,
      }),
      { tokensInput: 0, tokensOutput: 0, requestCount: 0 },
    );
    return { groupBy, includePlayground, items, totals };
  }
}
