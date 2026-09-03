import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { RedisModule } from '../../shared/redis/redis.module';
import { HealthController } from './health.controller';

@Module({
  imports: [RedisModule],
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
  ],
})
export class HealthModule implements OnModuleDestroy {
  constructor(@Inject('PG_POOL') private readonly pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
  }
}
