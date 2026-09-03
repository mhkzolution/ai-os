import { Module } from '@nestjs/common';
import { AiModule } from '../../shared/ai/ai.module';
import { QueueModule } from '../../shared/queue/queue.module';
import { FakeSuccessJobRunner } from './fake-success.job-runner';
import { JOB_RUNNER } from './job-runner';
import { JobsProcessor } from './jobs.processor';
import { ProviderResolver } from './provider-resolver.service';

@Module({
  imports: [QueueModule, AiModule],
  providers: [
    FakeSuccessJobRunner,
    { provide: JOB_RUNNER, useExisting: FakeSuccessJobRunner },
    ProviderResolver,
    JobsProcessor,
  ],
  exports: [ProviderResolver],
})
export class JobsWorkerModule {}
