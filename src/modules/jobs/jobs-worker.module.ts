import { Module } from '@nestjs/common';
import { QueueModule } from '../../shared/queue/queue.module';
import { FakeSuccessJobRunner } from './fake-success.job-runner';
import { JOB_RUNNER } from './job-runner';
import { JobsProcessor } from './jobs.processor';

@Module({
  imports: [QueueModule],
  providers: [
    FakeSuccessJobRunner,
    { provide: JOB_RUNNER, useExisting: FakeSuccessJobRunner },
    JobsProcessor,
  ],
})
export class JobsWorkerModule {}
