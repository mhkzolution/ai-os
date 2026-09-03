import { ClaudeProvider } from '../../src/shared/ai/claude.provider';
import {
  FAKE_PRODUCT_ANALYSIS_OUTPUT,
  FakeAIProvider,
} from '../../src/shared/ai/fake.provider';
import { GeminiProvider } from '../../src/shared/ai/gemini.provider';
import { OpenAIProvider } from '../../src/shared/ai/openai.provider';
import { OpenRouterProvider } from '../../src/shared/ai/openrouter.provider';
import { describeProviderContract } from './describe-provider-contract';

describeProviderContract('FakeAIProvider', () => new FakeAIProvider());
describeProviderContract(
  'OpenAIProvider',
  () => new OpenAIProvider({ apiKey: 'sk-test' }),
);
describeProviderContract(
  'GeminiProvider',
  () => new GeminiProvider({ apiKey: 'gemini-test' }),
);
describeProviderContract(
  'ClaudeProvider',
  () => new ClaudeProvider({ apiKey: 'claude-test' }),
);
describeProviderContract(
  'OpenRouterProvider',
  () => new OpenRouterProvider({ apiKey: 'or-test' }),
);

describe('FakeAIProvider.analyzeImage', () => {
  it('returns PRODUCT_ANALYSIS JSON plus token counts', async () => {
    const provider = new FakeAIProvider();
    const response = await provider.analyzeImage({
      model: 'fake-vision',
      images: ['https://example.com/a.jpg'],
    });

    expect(response.content).toEqual(FAKE_PRODUCT_ANALYSIS_OUTPUT);
    expect(response.tokensInput).toBeGreaterThan(0);
    expect(response.tokensOutput).toBeGreaterThan(0);
    expect(response.raw).toBeDefined();
  });
});
