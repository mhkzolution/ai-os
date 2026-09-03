import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderType } from '../../../generated/prisma/enums';
import type { AIProvider } from './ai-provider.interface';
import { ClaudeProvider } from './claude.provider';
import { FakeAIProvider } from './fake.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { OpenRouterProvider } from './openrouter.provider';

export type ProviderRow = {
  type: ProviderType;
  apiKeyEncrypted?: string;
  baseUrl?: string | null;
};

@Injectable()
export class AiProviderFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly fake: FakeAIProvider,
  ) {}

  get(provider: ProviderRow): AIProvider {
    if (this.useFake()) {
      return this.fake;
    }
    const credentials = { baseUrl: provider.baseUrl };
    switch (provider.type) {
      case ProviderType.OPENAI:
        return new OpenAIProvider(credentials);
      case ProviderType.GEMINI:
        return new GeminiProvider(credentials);
      case ProviderType.CLAUDE:
        return new ClaudeProvider(credentials);
      case ProviderType.OPENROUTER:
        return new OpenRouterProvider(credentials);
      default:
        throw new NotImplementedException(
          `No adapter for provider type ${provider.type}`,
        );
    }
  }

  timeoutMs(): number {
    const raw = this.config.get<string>('PROVIDER_TIMEOUT_MS');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
  }

  private useFake(): boolean {
    const driver = this.config.get<string>('AI_PROVIDER_DRIVER');
    const env = this.config.get<string>('NODE_ENV');
    return driver === 'fake' || env === 'test';
  }
}
