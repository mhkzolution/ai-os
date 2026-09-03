import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../../src/modules/health/health.controller';

describe('HealthController', () => {
  it('returns ok', () => {
    const controller = new HealthController();
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('returns ready when postgres and redis ping succeed', async () => {
    const pool = { query: jest.fn().mockResolvedValue({}) };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const controller = new HealthController(pool as never, redis as never);

    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
    expect(redis.ping).toHaveBeenCalled();
  });

  it('throws 503 when postgres is down', async () => {
    const pool = {
      query: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const controller = new HealthController(pool as never, redis as never);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws 503 when redis is down', async () => {
    const pool = { query: jest.fn().mockResolvedValue({}) };
    const redis = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const controller = new HealthController(pool as never, redis as never);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
