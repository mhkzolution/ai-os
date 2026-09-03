import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CostsModule } from './modules/costs/costs.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ModelsModule } from './modules/models/models.module';
import { PlaygroundModule } from './modules/playground/playground.module';
import { PromptsModule } from './modules/prompts/prompts.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsageModule } from './modules/usage/usage.module';
import { AiModule } from './shared/ai/ai.module';
import { RequestIdMiddleware } from './shared/common/request-id.middleware';
import { PrismaModule } from './shared/prisma/prisma.module';
import { QueueModule } from './shared/queue/queue.module';
import { RedisModule } from './shared/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AiModule,
    RedisModule,
    QueueModule,
    HealthModule,
    AuthModule,
    ClientsModule,
    ProvidersModule,
    ModelsModule,
    PromptsModule,
    TasksModule,
    JobsModule,
    PlaygroundModule,
    UsageModule,
    CostsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
