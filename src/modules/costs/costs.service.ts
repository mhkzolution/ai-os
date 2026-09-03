import { Injectable } from '@nestjs/common';
import type { CostLog, UsageLog } from '../../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { calculateCost, type PriceSnapshot } from './cost.calculator';
import type { ReportingQueryDto } from '../usage/dto/reporting-query.dto';
import {
  groupFields,
  groupKey,
  resolveGroupBy,
  usageReportWhere,
} from '../usage/usage-report';

@Injectable()
export class CostsService {
  constructor(private readonly prisma: PrismaService) {}

  recordFromUsage(
    usage: UsageLog,
    snapshot: PriceSnapshot,
    currency: string,
  ): Promise<CostLog> {
    const amount = calculateCost(
      usage.tokensInput,
      usage.tokensOutput,
      snapshot,
    );
    return this.prisma.costLog.create({
      data: {
        usageLogId: usage.id,
        providerId: usage.providerId,
        modelId: usage.modelId,
        amount,
        currency,
      },
    });
  }

  async report(query: ReportingQueryDto) {
    const groupBy = resolveGroupBy(query);
    const includePlayground = query.includePlayground === true;
    const rows = await this.prisma.costLog.findMany({
      where: { usageLog: usageReportWhere(query) },
      include: { usageLog: true },
    });
    const grouped = new Map<
      string,
      { amount: number; currency: string; requestCount: number }
    >();
    for (const row of rows) {
      const key = groupKey(row.usageLog, groupBy);
      const current = grouped.get(key) ?? {
        amount: 0,
        currency: row.currency,
        requestCount: 0,
      };
      current.amount += Number(row.amount);
      current.requestCount += 1;
      grouped.set(key, current);
    }
    const items = [...grouped.entries()].map(([key, value]) => ({
      ...groupFields(groupBy, key),
      amount: value.amount,
      currency: value.currency,
      requestCount: value.requestCount,
    }));
    const totals = items.reduce(
      (acc, item) => ({
        amount: acc.amount + item.amount,
        currency: item.currency || acc.currency,
      }),
      { amount: 0, currency: 'USD' },
    );
    return { groupBy, includePlayground, items, totals };
  }
}
