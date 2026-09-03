import { Module } from '@nestjs/common';
import { AiModule } from '../../shared/ai/ai.module';
import { QueueModule } from '../../shared/queue/queue.module';
import { CostsModule } from '../costs/costs.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsageModule } from '../usage/usage.module';
import { JOB_RUNNER } from './job-runner';
import { JobRunnerService } from './job-runner.service';
import { JobsProcessor } from './jobs.processor';
import { ProviderResolver } from './provider-resolver.service';

@Module({
  imports: [QueueModule, AiModule, TasksModule, UsageModule, CostsModule],
  providers: [
    JobRunnerService,
    { provide: JOB_RUNNER, useExisting: JobRunnerService },
    ProviderResolver,
    JobsProcessor,
  ],
  exports: [ProviderResolver, JobRunnerService],
})
export class JobsWorkerModule {}
