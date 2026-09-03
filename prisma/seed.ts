import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient, ProviderType, Role } from '../generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const BCRYPT_COST = 12;

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to seed',
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Super Admin',
      role: Role.SUPER_ADMIN,
    },
  });

  const playgroundSecretHash = await bcrypt.hash('playground', BCRYPT_COST);
  const playground = await prisma.client.upsert({
    where: { code: 'PLAYGROUND' },
    update: {},
    create: {
      code: 'PLAYGROUND',
      name: 'Playground',
      apiSecretHash: playgroundSecretHash,
      isSystem: true,
      allowedIps: [],
    },
  });

  const task = await prisma.task.upsert({
    where: { code: 'PRODUCT_ANALYSIS' },
    update: {},
    create: {
      code: 'PRODUCT_ANALYSIS',
      name: 'Product Analysis',
      description:
        'Analyze product images and return structured JSON (name, brand, category, tags).',
      promptKey: 'PRODUCT_ANALYZER',
    },
  });

  const promptContent = readFileSync(
    join(__dirname, 'prompts', 'product-analyzer.v1.md'),
    'utf8',
  );
  const prompt = await prisma.prompt.upsert({
    where: { key_version: { key: 'PRODUCT_ANALYZER', version: 1 } },
    update: {},
    create: {
      key: 'PRODUCT_ANALYZER',
      version: 1,
      content: promptContent,
      description: 'JSON-only product analysis instructions for PRODUCT_ANALYSIS',
      isActive: true,
      createdById: admin.id,
    },
  });

  const inactiveProviders: Array<{
    name: string;
    type: ProviderType;
    priority: number;
  }> = [
    { name: 'OpenAI', type: ProviderType.OPENAI, priority: 10 },
    { name: 'Gemini', type: ProviderType.GEMINI, priority: 20 },
    { name: 'Claude', type: ProviderType.CLAUDE, priority: 30 },
    { name: 'OpenRouter', type: ProviderType.OPENROUTER, priority: 40 },
  ];

  for (const provider of inactiveProviders) {
    const existing = await prisma.provider.findFirst({
      where: { type: provider.type, name: provider.name },
    });
    if (!existing) {
      await prisma.provider.create({
        data: {
          name: provider.name,
          type: provider.type,
          apiKeyEncrypted: '',
          isActive: false,
          priority: provider.priority,
        },
      });
    }
  }

  console.log('Seed complete', {
    admin: admin.email,
    playground: playground.code,
    task: task.code,
    prompt: `${prompt.key}@${prompt.version}`,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
