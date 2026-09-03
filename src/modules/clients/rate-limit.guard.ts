import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../shared/redis/redis.constants';
import type { RequestWithClient } from './api-key.guard';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClient>();
    const client = request.client;
    if (!client) {
      throw new UnauthorizedException();
    }
    const window = new Date().toISOString().slice(0, 16);
    const key = `rl:${client.id}:${window}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 120);
    }
    if (count > client.rateLimitPerMinute) {
      throw new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
