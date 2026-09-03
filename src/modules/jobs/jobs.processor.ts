import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { AI_JOBS_QUEUE } from '../../shared/queue/queue.constants';
import { JOB_RUNNER, type JobRunner } from './job-runner';

@Processor(AI_JOBS_QUEUE)
export class JobsProcessor extends WorkerHost {
  constructor(@Inject(JOB_RUNNER) private readonly jobRunner: JobRunner) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    await this.jobRunner.run(job.data.jobId);
  }
}
