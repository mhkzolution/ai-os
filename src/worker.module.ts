import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobsWorkerModule } from './modules/jobs/jobs-worker.module';
import { AiModule } from './shared/ai/ai.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { QueueModule } from './shared/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AiModule,
    QueueModule,
    JobsWorkerModule,
  ],
})
export class WorkerModule {}
