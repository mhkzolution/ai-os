import { Injectable } from '@nestjs/common';
import { JobStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { JobRunner } from './job-runner';

@Injectable()
export class FakeSuccessJobRunner implements JobRunner {
  constructor(private readonly prisma: PrismaService) {}

  async run(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return;
    }
    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.PROCESSING },
    });
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
