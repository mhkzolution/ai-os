import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { Role } from '../../generated/prisma/enums';
import { AppModule } from '../../src/app.module';
import { compactOpenApiAuth, createOpenApiDocument } from '../../src/openapi';
import { HttpExceptionFilter } from '../../src/shared/common/http-exception.filter';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

const ADMIN_EMAIL = 'm9-admin@aios.local';
const PASSWORD = 'TestPass123!';
const SNAPSHOT = join(__dirname, '../contract/openapi.auth.json');
const SECRET_KEYS = [
  'passwordHash',
  'keyHash',
  'apiSecretHash',
  'apiKeyEncrypted',
];

describe('Quality gates', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  const createdClientIds: string[] = [];
  const createdProviderIds: string[] = [];

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
      update: { passwordHash, role: Role.SUPER_ADMIN, isActive: true },
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: 'M9 Admin',
        role: Role.SUPER_ADMIN,
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    adminToken = login.body.accessToken as string;
  });

  afterAll(async () => {
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

  it('documents Bearer and apiKey schemes on the correct routes', () => {
    const document = createOpenApiDocument(app);
    const compact = compactOpenApiAuth(document);
    expect(compact.securitySchemes).toMatchObject({
      bearer: { type: 'http', scheme: 'bearer' },
      apiKey: { type: 'apiKey', name: 'X-API-Key', in: 'header' },
    });
    expect(compact.paths['/api/v1/jobs']?.post?.security).toEqual([
      { apiKey: [] },
    ]);
    expect(compact.paths['/api/v1/jobs/{id}']?.get?.security).toEqual([
      { apiKey: [] },
    ]);
    expect(compact.paths['/api/v1/admin/jobs']?.get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(compact.paths['/api/v1/playground/execute']?.post?.security).toEqual(
      [{ bearer: [] }],
    );
    expect(compact.paths['/api/v1/usage']?.get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(compact.paths['/api/v1/costs']?.get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(compact.paths['/api/v1/health']?.get?.security).toEqual([]);
    expect(compact.paths['/api/v1/auth/login']?.post?.security).toEqual([]);

    if (process.env.UPDATE_OPENAPI_SNAPSHOT === '1') {
      writeFileSync(SNAPSHOT, `${JSON.stringify(compact, null, 2)}\n`);
    }
    expect(existsSync(SNAPSHOT)).toBe(true);
    const expected = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as unknown;
    expect(compact).toEqual(expected);
  });

  it('does not leak secret fields on auth, client, or provider responses', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(me.status).toBe(200);

    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `m9_sec_${Date.now()}`, name: 'Secrets' });
    expect(created.status).toBe(201);
    createdClientIds.push(created.body.client.id as string);

    const client = await request(app.getHttpServer())
      .get(`/api/v1/clients/${created.body.client.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(client.status).toBe(200);

    const provider = await request(app.getHttpServer())
      .post('/api/v1/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `m9-prov-${Date.now()}`,
        type: 'OPENAI',
        apiKey: 'sk-should-not-leak',
        priority: 90,
      });
    expect(provider.status).toBe(201);
    createdProviderIds.push(provider.body.id as string);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/providers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listed.status).toBe(200);

    const blobs = [
      me.body,
      created.body,
      client.body,
      provider.body,
      listed.body,
    ];
    for (const body of blobs) {
      const raw = JSON.stringify(body);
      for (const key of SECRET_KEYS) {
        expect(raw).not.toContain(key);
      }
      expect(raw).not.toContain('sk-should-not-leak');
    }
  });
});
