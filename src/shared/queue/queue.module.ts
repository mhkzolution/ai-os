import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AI_JOBS_QUEUE } from './queue.constants';

function redisConnection(redisUrl?: string) {
  const url = new URL(redisUrl ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    maxRetriesPerRequest: null,
  };
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config.get<string>('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue({
      name: AI_JOBS_QUEUE,
      forceDisconnectOnShutdown: true,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
