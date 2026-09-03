import type { Prisma } from '../../../generated/prisma/client';
import type {
  ReportGroupBy,
  ReportingQueryDto,
} from './dto/reporting-query.dto';

export const PLAYGROUND_CLIENT_CODE = 'PLAYGROUND';

export function usageReportWhere(
  query: ReportingQueryDto,
): Prisma.UsageLogWhereInput {
  const where: Prisma.UsageLogWhereInput = {};
  if (query.clientId) {
    where.clientId = query.clientId;
  } else if (!query.includePlayground) {
    where.client = { is: { code: { not: PLAYGROUND_CLIENT_CODE } } };
  }
  if (query.providerId) {
    where.providerId = query.providerId;
  }
  if (query.modelId) {
    where.modelId = query.modelId;
  }
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
  }
  return where;
}

export function resolveGroupBy(query: ReportingQueryDto): ReportGroupBy {
  return query.groupBy ?? 'day';
}

export function groupKey(
  row: { createdAt: Date; clientId: string; providerId: string },
  groupBy: ReportGroupBy,
): string {
  if (groupBy === 'client') {
    return row.clientId;
  }
  if (groupBy === 'provider') {
    return row.providerId;
  }
  return row.createdAt.toISOString().slice(0, 10);
}

export function groupFields(groupBy: ReportGroupBy, key: string) {
  if (groupBy === 'client') {
    return { clientId: key };
  }
  if (groupBy === 'provider') {
    return { providerId: key };
  }
  return { day: key };
}
