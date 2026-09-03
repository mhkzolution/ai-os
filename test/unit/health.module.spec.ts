import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { HealthModule } from '../../src/modules/health/health.module';

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('ioredis', () => {
  const RedisMock = jest.fn().mockImplementation(() => ({
    ping: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  }));
  return { __esModule: true, default: RedisMock };
});

describe('HealthModule', () => {
  const PoolMock = Pool as unknown as jest.Mock;
  const RedisMock = Redis as unknown as jest.Mock;

  beforeEach(() => {
    PoolMock.mockClear();
    RedisMock.mockClear();
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  it('creates pg Pool with a connection timeout so ready cannot hang', async () => {
    await Test.createTestingModule({ imports: [HealthModule] }).compile();

    expect(PoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeoutMillis: 2000 }),
    );
  });

  it('creates redis with connect timeout and no retry loop so ready cannot hang', async () => {
    await Test.createTestingModule({ imports: [HealthModule] }).compile();

    expect(RedisMock).toHaveBeenCalled();
    const options = RedisMock.mock.calls[0][1] as {
      connectTimeout: number;
      maxRetriesPerRequest: number;
      retryStrategy: (times: number) => number | null;
    };
    expect(options.connectTimeout).toBe(2000);
    expect(options.maxRetriesPerRequest).toBe(1);
    expect(options.retryStrategy(1)).toBeNull();
  });

  it('ends the postgres pool and quits redis when the module is destroyed', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    await moduleRef.init();
    const pool = PoolMock.mock.results[0].value as { end: jest.Mock };
    const redis = RedisMock.mock.results[0].value as {
      quit: jest.Mock;
      disconnect: jest.Mock;
    };

    await moduleRef.close();

    expect(pool.end).toHaveBeenCalled();
    expect(redis.quit).toHaveBeenCalled();
  });

  it('disconnects redis if quit fails during destroy', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    await moduleRef.init();
    const redis = RedisMock.mock.results[0].value as {
      quit: jest.Mock;
      disconnect: jest.Mock;
    };
    redis.quit.mockRejectedValueOnce(new Error('not connected'));

    await moduleRef.close();

    expect(redis.disconnect).toHaveBeenCalled();
  });
});
