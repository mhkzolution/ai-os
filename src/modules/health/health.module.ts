import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: () =>
        new Pool({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 2000,
        }),
    },
    {
      provide: 'REDIS_CLIENT',
      useFactory: () =>
        new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          retryStrategy: () => null,
        }),
    },
  ],
})
export class HealthModule implements OnModuleDestroy {
  constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async onModuleDestroy() {
    await this.pool.end();
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
