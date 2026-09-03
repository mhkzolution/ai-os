import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { ModelPurpose, ProviderType, Role } from '../../generated/prisma/enums';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/shared/common/http-exception.filter';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

const PASSWORD = 'TestPass123!';
const ADMIN_EMAIL = 'm8-admin@aios.local';
const VIEWER_EMAIL = 'm8-viewer@aios.local';

describe('Usage and cost reporting (integration)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let viewerToken: string;
  let communityId: string;
  let academyId: string;
  let playgroundId: string;
  let providerId: string;
  let modelId: string;
  const createdClientIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdUsageIds: string[] = [];

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

    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { passwordHash, role: Role.ADMIN, isActive: true },
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: 'M8 Admin',
        role: Role.ADMIN,
      },
    });
    await prisma.user.upsert({
      where: { email: VIEWER_EMAIL },
      update: { passwordHash, role: Role.VIEWER, isActive: true },
      create: {
        email: VIEWER_EMAIL,
        passwordHash,
        name: 'M8 Viewer',
        role: Role.VIEWER,
      },
    });

    const playground = await prisma.client.upsert({
      where: { code: 'PLAYGROUND' },
      update: { isSystem: true, isActive: true },
      create: {
        code: 'PLAYGROUND',
        name: 'Playground',
        apiSecretHash: passwordHash,
        isSystem: true,
      },
    });
    playgroundId = playground.id;

    const community = await prisma.client.create({
      data: {
        code: `m8_community_${Date.now()}`,
        name: 'Community',
        apiSecretHash: passwordHash,
      },
    });
    communityId = community.id;
    createdClientIds.push(community.id);

    const academy = await prisma.client.create({
      data: {
        code: `m8_academy_${Date.now()}`,
        name: 'Academy',
        apiSecretHash: passwordHash,
      },
    });
    academyId = academy.id;
    createdClientIds.push(academy.id);

    const provider = await prisma.provider.create({
      data: {
        name: `m8-openai-${Date.now()}`,
        type: ProviderType.OPENAI,
        apiKeyEncrypted: '',
        isActive: true,
        priority: 80,
      },
    });
    providerId = provider.id;
    createdProviderIds.push(provider.id);
    const model = await prisma.model.create({
      data: {
        providerId: provider.id,
        name: 'm8-vision',
        purpose: ModelPurpose.VISION,
        inputPricePer1k: 0.01,
        outputPricePer1k: 0.03,
        currency: 'USD',
      },
    });
    modelId = model.id;

    const communityUsage = await seedUsage(communityId, 1000, 100, 1.3);
    const academyUsage = await seedUsage(academyId, 500, 50, 0.65);
    const playgroundUsage = await seedUsage(playgroundId, 9000, 900, 99);
    createdUsageIds.push(communityUsage, academyUsage, playgroundUsage);

    adminToken = await login(ADMIN_EMAIL);
    viewerToken = await login(VIEWER_EMAIL);
  });

  afterAll(async () => {
    if (createdUsageIds.length > 0) {
      await prisma.costLog.deleteMany({
        where: { usageLogId: { in: createdUsageIds } },
      });
      await prisma.usageLog.deleteMany({
        where: { id: { in: createdUsageIds } },
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
    if (createdClientIds.length > 0) {
      await prisma.client.deleteMany({
        where: { id: { in: createdClientIds } },
      });
    }
    await app.close();
  });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    return res.body.accessToken as string;
  }

  async function seedUsage(
    clientId: string,
    tokensInput: number,
    tokensOutput: number,
    amount: number,
  ) {
    const usage = await prisma.usageLog.create({
      data: {
        clientId,
        providerId,
        modelId,
        tokensInput,
        tokensOutput,
        requestCount: 1,
        requestId: `m8-${clientId}`,
      },
    });
    await prisma.costLog.create({
      data: {
        usageLogId: usage.id,
        providerId,
        modelId,
        amount,
        currency: 'USD',
      },
    });
    return usage.id;
  }

  it('GET /usage excludes PLAYGROUND by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/usage')
      .query({ providerId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.includePlayground).toBe(false);
    expect(res.body.totals.tokensInput).toBe(1500);
    expect(res.body.totals.tokensOutput).toBe(150);
    expect(
      res.body.items.every(
        (item: { clientId?: string }) => item.clientId !== playgroundId,
      ),
    ).toBe(true);
  });

  it('GET /usage?includePlayground=true includes PLAYGROUND totals', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/usage')
      .query({ includePlayground: true, groupBy: 'client', providerId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.includePlayground).toBe(true);
    expect(res.body.totals.tokensInput).toBe(10500);
    const clientIds = res.body.items.map(
      (item: { clientId: string }) => item.clientId,
    );
    expect(clientIds).toEqual(
      expect.arrayContaining([communityId, academyId, playgroundId]),
    );
  });

  it('GET /costs aggregates through usageLogId and excludes PLAYGROUND by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/costs')
      .query({ providerId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.includePlayground).toBe(false);
    expect(res.body.totals.amount).toBeCloseTo(1.95);
    expect(res.body.totals.currency).toBe('USD');
  });

  it('GET /costs?includePlayground=true does not mix PLAYGROUND into default production totals', async () => {
    const included = await request(app.getHttpServer())
      .get('/api/v1/costs')
      .query({ includePlayground: true, providerId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(included.status).toBe(200);
    expect(included.body.totals.amount).toBeCloseTo(100.95);

    const production = await request(app.getHttpServer())
      .get('/api/v1/costs')
      .query({ providerId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(production.body.totals.amount).toBeCloseTo(1.95);
  });

  it('filters by clientId, providerId, modelId and date range', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/usage')
      .query({
        clientId: communityId,
        providerId,
        modelId,
        groupBy: 'client',
        from: '2020-01-01T00:00:00.000Z',
        to: '2099-12-31T23:59:59.000Z',
      })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].clientId).toBe(communityId);
    expect(res.body.totals.tokensInput).toBe(1000);
  });

  it('groups costs by client via CostLog.usageLogId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/costs')
      .query({ groupBy: 'client', providerId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('client');
    const community = res.body.items.find(
      (item: { clientId: string }) => item.clientId === communityId,
    );
    expect(community.amount).toBeCloseTo(1.3);
    expect(
      res.body.items.some(
        (item: { clientId: string }) => item.clientId === playgroundId,
      ),
    ).toBe(false);
  });

  it('does not change CostLog amount when the live Model price changes', async () => {
    await prisma.model.update({
      where: { id: modelId },
      data: { inputPricePer1k: 9, outputPricePer1k: 9 },
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/costs')
      .query({ clientId: communityId, groupBy: 'client' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items[0].amount).toBeCloseTo(1.3);
  });

  it('lets VIEWER read usage and costs', async () => {
    const usage = await request(app.getHttpServer())
      .get('/api/v1/usage')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(usage.status).toBe(200);
    const costs = await request(app.getHttpServer())
      .get('/api/v1/costs')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(costs.status).toBe(200);
  });

  it('rejects API key auth', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/usage')
      .set('X-API-Key', 'pk_nope');
    expect(res.status).toBe(401);
  });
});
