/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { ModelPurpose, ProviderType, Role } from '../../generated/prisma/enums';
import { AppModule } from '../../src/app.module';
import { JobsWorkerModule } from '../../src/modules/jobs/jobs-worker.module';
import { HttpExceptionFilter } from '../../src/shared/common/http-exception.filter';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { calculateCost } from '../../src/modules/costs/cost.calculator';
import { FakeAIProvider, FAKE_PRODUCT_ANALYSIS_OUTPUT } from '../../src/shared/ai/fake.provider';

const ADMIN_EMAIL = 'm6-admin@aios.local';
const PASSWORD = 'TestPass123!';
const VALID_INPUT = { images: ['https://example.com/a.jpg'] };

describe('PRODUCT_ANALYSIS worker (integration)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let fake: FakeAIProvider;
  let adminToken: string;
  let apiKey: string;
  let clientId: string;
  let providerId: string;
  let modelId: string;
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
    fake = app.get(FakeAIProvider);

    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { passwordHash, role: Role.SUPER_ADMIN, isActive: true },
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: 'M6 Admin',
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
      update: { isActive: true, content: 'Return JSON only.' },
      create: {
        key: 'PRODUCT_ANALYZER',
        version: 1,
        content: 'Return JSON only.',
        isActive: true,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    adminToken = login.body.accessToken as string;

    const client = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `m6_community_${Date.now()}`, name: 'M6 Community' });
    apiKey = client.body.apiKey as string;
    clientId = client.body.client.id as string;
    createdClientIds.push(clientId);

    const provider = await prisma.provider.create({
      data: {
        name: `m6-openai-${Date.now()}`,
        type: ProviderType.OPENAI,
        apiKeyEncrypted: '',
        isActive: true,
        priority: 0,
      },
    });
    providerId = provider.id;
    createdProviderIds.push(provider.id);
    const model = await prisma.model.create({
      data: {
        providerId: provider.id,
        name: 'fake-vision',
        purpose: ModelPurpose.VISION,
        inputPricePer1k: 0.01,
        outputPricePer1k: 0.03,
        currency: 'USD',
        isActive: true,
      },
    });
    modelId = model.id;
  });

  afterAll(async () => {
    await cleanupJobs(createdJobIds);
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

  async function cleanupJobs(jobIds: string[]) {
    const ids = jobIds.filter(Boolean);
    if (ids.length === 0) return;
    await prisma.costLog.deleteMany({
      where: { usageLog: { jobId: { in: ids } } },
    });
    await prisma.usageLog.deleteMany({ where: { jobId: { in: ids } } });
    await prisma.execution.deleteMany({ where: { jobId: { in: ids } } });
    await prisma.job.deleteMany({ where: { id: { in: ids } } });
  }

  async function waitForStatus(jobId: string, status: string) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (job?.status === status) {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`timed out waiting for job ${jobId} to become ${status}`);
  }

  async function postJob() {
    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', apiKey)
      .send({ taskCode: 'PRODUCT_ANALYSIS', input: VALID_INPUT });
    expect(res.status).toBe(202);
    createdJobIds.push(res.body.id as string);
    return res.body.id as string;
  }

  it('happy path writes Execution, UsageLog, CostLog and COMPLETED output', async () => {
    const jobId = await postJob();
    const job = await waitForStatus(jobId, 'COMPLETED');
    expect(job.output).toEqual(FAKE_PRODUCT_ANALYSIS_OUTPUT);

    const executions = await prisma.execution.findMany({ where: { jobId } });
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe('COMPLETED');
    expect(executions[0].providerSnapshot).toMatchObject({
      id: providerId,
    });
    expect(executions[0].modelSnapshot).toMatchObject({
      id: modelId,
      inputPricePer1k: 0.01,
      outputPricePer1k: 0.03,
      currency: 'USD',
    });
    expect(executions[0].promptSnapshot).toMatchObject({
      key: 'PRODUCT_ANALYZER',
      version: expect.any(Number),
      id: expect.any(String),
    });

    const usage = await prisma.usageLog.findMany({ where: { jobId } });
    expect(usage).toHaveLength(1);
    expect(usage[0].executionId).toBe(executions[0].id);
    expect(job.output).toEqual(executions[0].output);
    expect(usage[0].tokensInput).toBe(120);
    expect(usage[0].tokensOutput).toBe(40);

    const cost = await prisma.costLog.findUnique({
      where: { usageLogId: usage[0].id },
    });
    expect(cost).not.toBeNull();
    expect(Number(cost?.amount)).toBeCloseTo(
      calculateCost(120, 40, {
        inputPricePer1k: 0.01,
        outputPricePer1k: 0.03,
      }),
    );
  });

  it('OUTPUT_INVALID fails the job without retry and without usage', async () => {
    fake.setAnalyzeImageContent({ brand: 123 });
    const jobId = await postJob();
    const job = await waitForStatus(jobId, 'FAILED');
    expect(job.error).toMatchObject({
      code: 'OUTPUT_INVALID',
      category: 'VALIDATION',
      retryable: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const executions = await prisma.execution.findMany({ where: { jobId } });
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe('FAILED');
    expect(executions[0].rawResponse).toBeTruthy();
    expect(await prisma.usageLog.count({ where: { jobId } })).toBe(0);
  });

  it('NO_PROVIDER fails with zero usage', async () => {
    const previouslyActive = await prisma.provider.findMany({
      where: { isActive: true },
    });
    await prisma.provider.updateMany({ data: { isActive: false } });
    try {
      const jobId = await postJob();
      const job = await waitForStatus(jobId, 'FAILED');
      expect(job.error).toMatchObject({
        code: 'NO_PROVIDER',
        category: 'CONFIG',
        retryable: false,
      });
      expect(await prisma.usageLog.count({ where: { jobId } })).toBe(0);
    } finally {
      await prisma.provider.updateMany({
        where: { id: { in: previouslyActive.map((p) => p.id) } },
        data: { isActive: true },
      });
    }
  });

  it('NO_MODEL fails when no active model matches purpose', async () => {
    const previouslyActive = await prisma.provider.findMany({
      where: { isActive: true },
    });
    await prisma.provider.updateMany({ data: { isActive: false } });
    const chatOnly = await prisma.provider.create({
      data: {
        name: `m6-chat-${Date.now()}`,
        type: ProviderType.OPENAI,
        apiKeyEncrypted: '',
        isActive: true,
        priority: 1,
        models: {
          create: {
            name: 'chat-only',
            purpose: ModelPurpose.CHAT,
            inputPricePer1k: 0.01,
            outputPricePer1k: 0.02,
          },
        },
      },
    });
    createdProviderIds.push(chatOnly.id);
    try {
      const jobId = await postJob();
      const job = await waitForStatus(jobId, 'FAILED');
      expect(job.error).toMatchObject({
        code: 'NO_MODEL',
        category: 'CONFIG',
        retryable: false,
      });
    } finally {
      await prisma.provider.update({
        where: { id: chatOnly.id },
        data: { isActive: false },
      });
      await prisma.provider.updateMany({
        where: { id: { in: previouslyActive.map((p) => p.id) } },
        data: { isActive: true },
      });
    }
  });

  it('NO_PROMPT fails when no active prompt exists', async () => {
    await prisma.prompt.updateMany({
      where: { key: 'PRODUCT_ANALYZER' },
      data: { isActive: false },
    });
    try {
      const jobId = await postJob();
      const job = await waitForStatus(jobId, 'FAILED');
      expect(job.error).toMatchObject({
        code: 'NO_PROMPT',
        category: 'CONFIG',
        retryable: false,
      });
    } finally {
      await prisma.prompt.updateMany({
        where: { key: 'PRODUCT_ANALYZER', version: 1 },
        data: { isActive: true },
      });
    }
  });
});
