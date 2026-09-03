/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import 'dotenv/config';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { Role } from '../../generated/prisma/enums';
import { AppModule } from '../../src/app.module';
import { ClientsModule } from '../../src/modules/clients/clients.module';
import { HttpExceptionFilter } from '../../src/shared/common/http-exception.filter';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ApiKeyProbeController } from './api-key-probe.controller';

@Module({
  imports: [ClientsModule],
  controllers: [ApiKeyProbeController],
})
class ApiKeyProbeModule {}

const ADMIN_EMAIL = 'm3-admin@aios.local';
const VIEWER_EMAIL = 'm3-viewer@aios.local';
const PASSWORD = 'TestPass123!';

describe('Auth and clients (integration)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let viewerToken: string;
  const createdClientIds: string[] = [];
  const createdPromptIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ApiKeyProbeModule],
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
        name: 'M3 Admin',
      },
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: 'M3 Admin',
        role: Role.SUPER_ADMIN,
      },
    });
    await prisma.user.upsert({
      where: { email: VIEWER_EMAIL },
      update: {
        passwordHash,
        role: Role.VIEWER,
        isActive: true,
        name: 'M3 Viewer',
      },
      create: {
        email: VIEWER_EMAIL,
        passwordHash,
        name: 'M3 Viewer',
        role: Role.VIEWER,
      },
    });
    await prisma.client.upsert({
      where: { code: 'PLAYGROUND' },
      update: { isSystem: true },
      create: {
        code: 'PLAYGROUND',
        name: 'Playground',
        apiSecretHash: passwordHash,
        isSystem: true,
        allowedIps: [],
      },
    });
  });

  afterAll(async () => {
    if (createdPromptIds.length > 0) {
      await prisma.prompt.deleteMany({
        where: { id: { in: createdPromptIds } },
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

  async function login(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
  }

  it('logs in the admin and returns a token', async () => {
    const res = await login(ADMIN_EMAIL, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.expiresInHours).toBe(8);
    adminToken = res.body.accessToken as string;
  });

  it('rejects a wrong password with 401', async () => {
    const res = await login(ADMIN_EMAIL, 'wrong-password');
    expect(res.status).toBe(401);
  });

  it('returns the current user on GET /auth/me', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(ADMIN_EMAIL);
    expect(res.body.role).toBe(Role.SUPER_ADMIN);
    expect(res.body.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('creates a client, returns apiKey once, and omits it from GET', async () => {
    const code = `m3_${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name: 'Community Test' });
    expect(created.status).toBe(201);
    expect(created.body.apiKey).toMatch(/^aos_live_/);
    expect(created.body.apiSecret).toEqual(expect.any(String));
    expect(created.body.client.apiSecretHash).toBeUndefined();
    createdClientIds.push(created.body.client.id as string);

    const got = await request(app.getHttpServer())
      .get(`/api/v1/clients/${created.body.client.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(got.status).toBe(200);
    expect(got.body.apiKey).toBeUndefined();
    expect(got.body.apiSecret).toBeUndefined();
    expect(got.body.apiSecretHash).toBeUndefined();
    expect(JSON.stringify(got.body)).not.toContain(created.body.apiKey);
    expect(got.body.keys[0].keyHash).toBeUndefined();
    expect(got.body.keys[0].kind).toBe('PRIMARY');
    expect(got.body.keys[0].keyPrefix).toMatch(/^aos_live_/);
  });

  it('rejects a wrong API key with 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/api-key-probe')
      .set('X-API-Key', 'aos_live_this_key_does_not_exist');
    expect(res.status).toBe(401);
  });

  it('rejects a revoked API key with 401', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `m3_revoked_${Date.now()}`, name: 'Revoke Me' });
    expect(created.status).toBe(201);
    createdClientIds.push(created.body.client.id as string);
    const apiKey = created.body.apiKey as string;
    const keyId = created.body.client.keys[0].id as string;

    const revoked = await request(app.getHttpServer())
      .post(`/api/v1/clients/${created.body.client.id}/keys/${keyId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoked.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/api-key-probe')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(401);
  });

  it('rejects a disabled client with 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `m3_disabled_${Date.now()}`, name: 'Disable Me' });
    expect(created.status).toBe(201);
    createdClientIds.push(created.body.client.id as string);
    const apiKey = created.body.apiKey as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/clients/${created.body.client.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(patched.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/api-key-probe')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(403);
  });

  it('rotates a key as SECONDARY that still authenticates', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `m3_rotate_${Date.now()}`, name: 'Rotate Me' });
    expect(created.status).toBe(201);
    createdClientIds.push(created.body.client.id as string);
    const primaryKey = created.body.apiKey as string;

    const rotated = await request(app.getHttpServer())
      .post(`/api/v1/clients/${created.body.client.id}/keys/rotate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(rotated.status).toBe(201);
    expect(rotated.body.kind).toBe('SECONDARY');
    expect(rotated.body.apiKey).toMatch(/^aos_live_/);

    const secondaryOk = await request(app.getHttpServer())
      .get('/api/v1/api-key-probe')
      .set('X-API-Key', rotated.body.apiKey as string);
    expect(secondaryOk.status).toBe(200);

    const primaryOk = await request(app.getHttpServer())
      .get('/api/v1/api-key-probe')
      .set('X-API-Key', primaryKey);
    expect(primaryOk.status).toBe(200);

    const keys = await request(app.getHttpServer())
      .get(`/api/v1/clients/${created.body.client.id}/keys`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(keys.status).toBe(200);
    expect(keys.body.map((k: { kind: string }) => k.kind).sort()).toEqual([
      'PRIMARY',
      'SECONDARY',
    ]);
    expect(keys.body.every((k: { isActive: boolean }) => k.isActive)).toBe(
      true,
    );
    expect(
      keys.body.every((k: { revokedAt: string | null }) => !k.revokedAt),
    ).toBe(true);
  });

  it('forbids deleting the PLAYGROUND system client', async () => {
    const playground = await prisma.client.findUnique({
      where: { code: 'PLAYGROUND' },
    });
    expect(playground).not.toBeNull();
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/clients/${playground!.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('forbids changing PLAYGROUND code or isSystem', async () => {
    const playground = await prisma.client.findUnique({
      where: { code: 'PLAYGROUND' },
    });
    expect(playground).not.toBeNull();

    const codePatch = await request(app.getHttpServer())
      .patch(`/api/v1/clients/${playground!.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'abc' });
    expect(codePatch.status).toBe(403);

    const systemPatch = await request(app.getHttpServer())
      .patch(`/api/v1/clients/${playground!.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSystem: false });
    expect(systemPatch.status).toBe(403);

    const still = await prisma.client.findUnique({
      where: { id: playground!.id },
    });
    expect(still?.code).toBe('PLAYGROUND');
    expect(still?.isSystem).toBe(true);
  });

  it('lets VIEWER read but not mutate clients', async () => {
    const loginRes = await login(VIEWER_EMAIL, PASSWORD);
    expect(loginRes.status).toBe(200);
    viewerToken = loginRes.body.accessToken as string;

    const list = await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(list.status).toBe(200);

    const create = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ code: `m3_viewer_${Date.now()}`, name: 'Nope' });
    expect(create.status).toBe(403);

    const playground = await prisma.client.findUnique({
      where: { code: 'PLAYGROUND' },
    });
    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/clients/${playground!.id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Hacked' });
    expect(patch.status).toBe(403);
  });

  it('activates a prompt version inside a transaction so only one version is active', async () => {
    const key = `M3_ANALYZER_${Date.now()}`;
    const v1 = await request(app.getHttpServer())
      .post('/api/v1/prompts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key, version: 1, content: 'v1' });
    expect(v1.status).toBe(201);
    createdPromptIds.push(v1.body.id as string);

    const v2 = await request(app.getHttpServer())
      .post('/api/v1/prompts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key, version: 2, content: 'v2' });
    expect(v2.status).toBe(201);
    createdPromptIds.push(v2.body.id as string);

    const activated1 = await request(app.getHttpServer())
      .post(`/api/v1/prompts/${v1.body.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activated1.status).toBe(201);
    expect(activated1.body.isActive).toBe(true);

    const activated2 = await request(app.getHttpServer())
      .post(`/api/v1/prompts/${v2.body.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activated2.status).toBe(201);

    const rows = await prisma.prompt.findMany({ where: { key } });
    expect(rows.filter((row) => row.isActive)).toHaveLength(1);
    expect(rows.find((row) => row.id === v2.body.id)?.isActive).toBe(true);
    expect(rows.find((row) => row.id === v1.body.id)?.isActive).toBe(false);
  });
});
