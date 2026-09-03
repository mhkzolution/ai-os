import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { ModelPurpose, ProviderType, Role } from '../../generated/prisma/enums';
import { AppModule } from '../../src/app.module';
import { calculateCost } from '../../src/modules/costs/cost.calculator';
import { HttpExceptionFilter } from '../../src/shared/common/http-exception.filter';
import { FakeAIProvider } from '../../src/shared/ai/fake.provider';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

const PASSWORD = 'TestPass123!';
const ADMIN_EMAIL = 'm7-admin@aios.local';
const SUPER_EMAIL = 'm7-super@aios.local';
const VIEWER_EMAIL = 'm7-viewer@aios.local';
const VALID_INPUT = { images: ['https://example.com/a.jpg'] };

describe('Playground (integration)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let fake: FakeAIProvider;
  let adminToken: string;
  let superToken: string;
  let viewerToken: string;
  let providerId: string;
  let modelId: string;
  let activePromptId: string;
  let draftPromptId: string;
  let playgroundClientId: string;
  const createdProviderIds: string[] = [];
  const createdPromptIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
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
    await upsertUser(ADMIN_EMAIL, Role.ADMIN, passwordHash);
    await upsertUser(SUPER_EMAIL, Role.SUPER_ADMIN, passwordHash);
    await upsertUser(VIEWER_EMAIL, Role.VIEWER, passwordHash);

    const playground = await prisma.client.upsert({
      where: { code: 'PLAYGROUND' },
      update: { isSystem: true, isActive: true },
      create: {
        code: 'PLAYGROUND',
        name: 'Playground',
        apiSecretHash: await bcrypt.hash('playground', 12),
        isSystem: true,
      },
    });
    playgroundClientId = playground.id;

    const provider = await prisma.provider.create({
      data: {
        name: `m7-openai-${Date.now()}`,
        type: ProviderType.OPENAI,
        apiKeyEncrypted: '',
        isActive: true,
        priority: 100,
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

    const active = await prisma.prompt.upsert({
      where: { key_version: { key: 'PRODUCT_ANALYZER', version: 1 } },
      update: { isActive: true, content: 'Active prompt' },
      create: {
        key: 'PRODUCT_ANALYZER',
        version: 1,
        content: 'Active prompt',
        isActive: true,
      },
    });
    activePromptId = active.id;

    const draft = await prisma.prompt.upsert({
      where: { key_version: { key: 'PRODUCT_ANALYZER', version: 9001 } },
      update: { isActive: false, content: 'Draft prompt' },
      create: {
        key: 'PRODUCT_ANALYZER',
        version: 9001,
        content: 'Draft prompt',
        isActive: false,
      },
    });
    draftPromptId = draft.id;
    createdPromptIds.push(draft.id);

    adminToken = await login(ADMIN_EMAIL);
    superToken = await login(SUPER_EMAIL);
    viewerToken = await login(VIEWER_EMAIL);
  });

  afterAll(async () => {
    const runs = await prisma.playgroundRun.findMany({
      where: {
        OR: [
          { id: { in: createdRunIds } },
          { providerId: { in: createdProviderIds } },
          { promptId: { in: createdPromptIds } },
        ],
      },
      select: { id: true },
    });
    const runIds = [
      ...new Set([...createdRunIds, ...runs.map((run) => run.id)]),
    ];
    if (runIds.length > 0) {
      await prisma.costLog.deleteMany({
        where: { usageLog: { playgroundRunId: { in: runIds } } },
      });
      await prisma.usageLog.deleteMany({
        where: { playgroundRunId: { in: runIds } },
      });
      await prisma.playgroundRun.deleteMany({
        where: { id: { in: runIds } },
      });
    }
    if (createdPromptIds.length > 0) {
      await prisma.prompt.deleteMany({
        where: { id: { in: createdPromptIds } },
      });
    }
    if (createdProviderIds.length > 0) {
      await prisma.model.deleteMany({
        where: { providerId: { in: createdProviderIds } },
      });
      await prisma.provider.deleteMany({
        where: { id: { in: createdProviderIds } },
      });
    }
    await app.close();
  });

  async function upsertUser(email: string, role: Role, passwordHash: string) {
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role, isActive: true },
      create: { email, passwordHash, name: email, role },
    });
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    return res.body.accessToken as string;
  }

  function payload(overrides: Record<string, unknown> = {}) {
    return {
      providerId,
      modelId,
      promptId: activePromptId,
      input: VALID_INPUT,
      ...overrides,
    };
  }

  it('creates PlaygroundRun, UsageLog, and CostLog on the PLAYGROUND client without a Job', async () => {
    const jobsBefore = await prisma.job.count();
    const res = await request(app.getHttpServer())
      .post('/api/v1/playground/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload());
    expect(res.status).toBe(200);
    expect(res.body.output).toBeDefined();
    expect(res.body.rawResponse).toBeDefined();
    expect(res.body.tokensInput).toBe(120);
    expect(res.body.tokensOutput).toBe(40);
    expect(res.body.estimatedCost).toBeCloseTo(
      calculateCost(120, 40, {
        inputPricePer1k: 0.01,
        outputPricePer1k: 0.03,
      }),
    );
    expect(res.body.currency).toBe('USD');
    expect(res.body.durationMs).toEqual(expect.any(Number));

    expect(await prisma.job.count()).toBe(jobsBefore);

    const run = await prisma.playgroundRun.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    expect(run).not.toBeNull();
    createdRunIds.push(run!.id);
    expect(run?.clientId).toBe(playgroundClientId);
    expect(run?.promptId).toBe(activePromptId);

    const usage = await prisma.usageLog.findMany({
      where: { playgroundRunId: run!.id },
    });
    expect(usage).toHaveLength(1);
    expect(usage[0].clientId).toBe(playgroundClientId);
    expect(usage[0].executionId).toBeNull();
    expect(usage[0].jobId).toBeNull();
    expect(
      await prisma.costLog.count({ where: { usageLogId: usage[0].id } }),
    ).toBe(1);
  });

  it('executes an inactive draft prompt', async () => {
    const jobsBefore = await prisma.job.count();
    const res = await request(app.getHttpServer())
      .post('/api/v1/playground/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload({ promptId: draftPromptId }));
    expect(res.status).toBe(200);
    expect(await prisma.job.count()).toBe(jobsBefore);
    const run = await prisma.playgroundRun.findFirst({
      where: { promptId: draftPromptId },
      orderBy: { createdAt: 'desc' },
    });
    expect(run).not.toBeNull();
    createdRunIds.push(run!.id);
  });

  it('returns 504 on PROVIDER_TIMEOUT and still persists PlaygroundRun without a Job', async () => {
    const jobsBefore = await prisma.job.count();
    fake.failNextWithTimeout();
    const res = await request(app.getHttpServer())
      .post('/api/v1/playground/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload());
    expect(res.status).toBe(504);
    expect(res.body.error).toBe('PROVIDER_TIMEOUT');
    expect(await prisma.job.count()).toBe(jobsBefore);
    const run = await prisma.playgroundRun.findFirst({
      where: { error: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    expect(run).not.toBeNull();
    createdRunIds.push(run!.id);
    expect(run?.error).toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    expect(
      await prisma.usageLog.count({ where: { playgroundRunId: run!.id } }),
    ).toBe(0);
  });

  it('forbids VIEWER and allows ADMIN and SUPER_ADMIN', async () => {
    const viewer = await request(app.getHttpServer())
      .post('/api/v1/playground/execute')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send(payload());
    expect(viewer.status).toBe(403);

    const admin = await request(app.getHttpServer())
      .post('/api/v1/playground/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload());
    expect(admin.status).toBe(200);

    const superAdmin = await request(app.getHttpServer())
      .post('/api/v1/playground/execute')
      .set('Authorization', `Bearer ${superToken}`)
      .send(payload());
    expect(superAdmin.status).toBe(200);

    const runs = await prisma.playgroundRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    createdRunIds.push(...runs.map((run) => run.id));
  });

  it('rejects API key auth on the playground route', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/playground/execute')
      .set('X-API-Key', 'pk_not_a_jwt')
      .send(payload());
    expect(res.status).toBe(401);
  });
});
