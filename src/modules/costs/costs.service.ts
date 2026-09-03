import { Injectable } from '@nestjs/common';
import type { CostLog, UsageLog } from '../../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { calculateCost, type PriceSnapshot } from './cost.calculator';

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
}
