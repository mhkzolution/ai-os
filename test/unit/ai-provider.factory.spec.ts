import { ConfigService } from '@nestjs/config';
import { ProviderType } from '../../generated/prisma/enums';
import { AiProviderFactory } from '../../src/shared/ai/ai-provider.factory';
import { FakeAIProvider } from '../../src/shared/ai/fake.provider';
import { OpenAIProvider } from '../../src/shared/ai/openai.provider';

function factory(env: Record<string, string | undefined>) {
  return new AiProviderFactory({
    get: (key: string) => env[key],
  } as ConfigService);
}

const openaiRow = {
  type: ProviderType.OPENAI,
  apiKeyEncrypted: 'cipher',
  baseUrl: null,
};

describe('AiProviderFactory', () => {
  it('returns FakeAIProvider when AI_PROVIDER_DRIVER=fake', () => {
    const ai = factory({
      AI_PROVIDER_DRIVER: 'fake',
      NODE_ENV: 'production',
    }).get(openaiRow);
    expect(ai).toBeInstanceOf(FakeAIProvider);
  });

  it('returns FakeAIProvider when NODE_ENV=test', () => {
    const ai = factory({
      AI_PROVIDER_DRIVER: 'live',
      NODE_ENV: 'test',
    }).get(openaiRow);
    expect(ai).toBeInstanceOf(FakeAIProvider);
  });

  it('returns the type adapter when live and not in test', () => {
    const ai = factory({
      AI_PROVIDER_DRIVER: 'live',
      NODE_ENV: 'production',
    }).get(openaiRow);
    expect(ai).toBeInstanceOf(OpenAIProvider);
  });
});
