import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksController } from './catalog/tasks.controller';
import { TasksService } from './catalog/tasks.service';
import { TaskRegistry } from './registry/task.registry';

@Module({
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [TasksService, TaskRegistry],
  exports: [TasksService, TaskRegistry],
})
export class TasksModule {}
