import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { ModelPurpose, ProviderType, Role } from '../../generated/prisma/enums';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppModule } from '../../src/app.module';
import { JobsWorkerModule } from '../../src/modules/jobs/jobs-worker.module';
import { AI_JOBS_QUEUE } from '../../src/shared/queue/queue.constants';
import { HttpExceptionFilter } from '../../src/shared/common/http-exception.filter';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

const ADMIN_EMAIL = 'm4-admin@aios.local';
const PASSWORD = 'TestPass123!';
const VALID_INPUT = { images: ['https://example.com/a.jpg'] };

describe('Jobs (integration)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let communityKey: string;
  let academyKey: string;
  let communityId: string;
  const createdClientIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdProviderIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, JobsWorkerModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: {
        passwordHash,
        role: Role.SUPER_ADMIN,
        isActive: true,
        name: 'M4 Admin',
      },
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: 'M4 Admin',
        role: Role.SUPER_ADMIN,
      },
    });
    await prisma.task.upsert({
      where: { code: 'PRODUCT_ANALYSIS' },
      update: { isActive: true, promptKey: 'PRODUCT_ANALYZER' },
      create: {
        code: 'PRODUCT_ANALYSIS',
        name: 'Product Analysis',
        description: 'Analyze product images',
        promptKey: 'PRODUCT_ANALYZER',
      },
    });
    await prisma.prompt.upsert({
      where: { key_version: { key: 'PRODUCT_ANALYZER', version: 1 } },
      update: { isActive: true },
      create: {
        key: 'PRODUCT_ANALYZER',
        version: 1,
        content: 'Return JSON only.',
        isActive: true,
      },
    });
    const provider = await prisma.provider.create({
      data: {
        name: `m4-openai-${Date.now()}`,
        type: ProviderType.OPENAI,
        apiKeyEncrypted: '',
        isActive: true,
        priority: 1,
        models: {
          create: {
            name: 'fake-vision',
            purpose: ModelPurpose.VISION,
            inputPricePer1k: 0.01,
            outputPricePer1k: 0.03,
            currency: 'USD',
            isActive: true,
          },
        },
      },
    });
    createdProviderIds.push(provider.id);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    adminToken = login.body.accessToken as string;

    const community = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `m4_community_${Date.now()}`, name: 'Community' });
    communityKey = community.body.apiKey as string;
    communityId = community.body.client.id as string;
    createdClientIds.push(communityId);

    const academy = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `m4_academy_${Date.now()}`, name: 'Academy' });
    academyKey = academy.body.apiKey as string;
    createdClientIds.push(academy.body.client.id as string);
  });

  afterAll(async () => {
    const jobIds = createdJobIds.filter((id): id is string => Boolean(id));
    if (jobIds.length > 0) {
      await prisma.costLog.deleteMany({
        where: { usageLog: { jobId: { in: jobIds } } },
      });
      await prisma.usageLog.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.execution.deleteMany({ where: { jobId: { in: jobIds } } });
      await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    }
    if (createdProviderIds.length > 0) {
      await prisma.model.deleteMany({
        where: { providerId: { in: createdProviderIds } },
      });
      await prisma.provider.deleteMany({
        where: { id: { in: createdProviderIds } },
      });
    }
    if (createdClientIds.length > 0) {
      await prisma.clientKey.deleteMany({
        where: { clientId: { in: createdClientIds } },
      });
      await prisma.client.deleteMany({
        where: { id: { in: createdClientIds } },
      });
    }
    await app.close();
  });

  async function waitForStatus(jobId: string, status: string) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (job?.status === status) {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`timed out waiting for job ${jobId} to become ${status}`);
  }

  it('POST /jobs returns 202 and a PENDING row, then the worker marks COMPLETED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', communityKey)
      .send({ taskCode: 'PRODUCT_ANALYSIS', input: VALID_INPUT });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.id).toEqual(expect.any(String));
    createdJobIds.push(res.body.id as string);

    const row = await prisma.job.findUnique({ where: { id: res.body.id } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe('PENDING');
    expect(row?.clientId).toBe(communityId);

    const queue = app.get<Queue>(getQueueToken(AI_JOBS_QUEUE));
    const queued = await queue.getJob(res.body.id as string);
    expect(queued).not.toBeNull();

    const own = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${res.body.id}`)
      .set('X-API-Key', communityKey);
    expect(own.status).toBe(200);
    expect(own.body.id).toBe(res.body.id);

    const completed = await waitForStatus(res.body.id as string, 'COMPLETED');
    expect(completed.status).toBe('COMPLETED');
  });

  it('GET /jobs/:id of another client is 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', communityKey)
      .send({ taskCode: 'PRODUCT_ANALYSIS', input: VALID_INPUT });
    expect(created.status).toBe(202);
    createdJobIds.push(created.body.id as string);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${created.body.id}`)
      .set('X-API-Key', academyKey);
    expect(res.status).toBe(404);
  });

  it('rejects invalid input schema with 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', communityKey)
      .send({ taskCode: 'PRODUCT_ANALYSIS', input: {} });
    expect(res.status).toBe(422);
  });

  it('rejects an unknown taskCode with 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', communityKey)
      .send({ taskCode: 'NOT_A_TASK', input: VALID_INPUT });
    expect(res.status).toBe(422);
  });

  it('rejects a disabled client with 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `m4_disabled_${Date.now()}`, name: 'Disabled' });
    const apiKey = created.body.apiKey as string;
    createdClientIds.push(created.body.client.id as string);

    await request(app.getHttpServer())
      .patch(`/api/v1/clients/${created.body.client.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', apiKey)
      .send({ taskCode: 'PRODUCT_ANALYSIS', input: VALID_INPUT });
    expect(res.status).toBe(403);
  });

  it('lists jobs for admins with JWT and basic filters', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', communityKey)
      .send({ taskCode: 'PRODUCT_ANALYSIS', input: VALID_INPUT });
    createdJobIds.push(created.body.id as string);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/jobs')
      .query({ clientId: communityId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.items.some((job: { id: string }) => job.id === created.body.id),
    ).toBe(true);
  });

  it('rejects a client that exceeds rateLimitPerMinute with 429', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `m4_rl_${Date.now()}`,
        name: 'Rate Limited',
        rateLimitPerMinute: 1,
      });
    const apiKey = created.body.apiKey as string;
    createdClientIds.push(created.body.client.id as string);

    const first = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', apiKey)
      .send({ taskCode: 'PRODUCT_ANALYSIS', input: VALID_INPUT });
    expect(first.status).toBe(202);
    createdJobIds.push(first.body.id as string);

    const second = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', apiKey)
      .send({ taskCode: 'PRODUCT_ANALYSIS', input: VALID_INPUT });
    expect(second.status).toBe(429);
  });
});
