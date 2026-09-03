import { Injectable } from '@nestjs/common';
import { JobStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { JobRunner } from './job-runner';

@Injectable()
export class FakeSuccessJobRunner implements JobRunner {
  constructor(private readonly prisma: PrismaService) {}

  async run(jobId: string): Promise<void> {
    const claimed = await this.prisma.job.updateMany({
      where: { id: jobId, status: JobStatus.PENDING },
      data: { status: JobStatus.PROCESSING },
    });
    if (claimed.count === 0) {
      return;
    }
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        output: { ok: true },
        completedAt: new Date(),
      },
    });
  }
}
