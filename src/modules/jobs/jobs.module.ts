import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { TasksModule } from '../tasks/tasks.module';
import { QueueModule } from '../../shared/queue/queue.module';
import { AdminJobsController } from './admin-jobs.controller';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [QueueModule, AuthModule, ClientsModule, TasksModule],
  controllers: [JobsController, AdminJobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
