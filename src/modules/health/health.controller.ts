import {
  Controller,
  Get,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { REDIS_CLIENT } from '../../shared/redis/redis.constants';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Optional() @Inject('PG_POOL') private readonly pool?: Pool,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  @Get()
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      if (!this.pool || !this.redis) {
        throw new Error('postgres or redis client is not configured');
      }
      await this.pool.query('SELECT 1');
      await this.redis.ping();
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
