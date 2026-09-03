import { NotImplementedException } from '@nestjs/common';
import type { AIProvider } from './ai-provider.interface';
import type { AIResponse } from './ai-response';

export type AdapterCredentials = {
  apiKey?: string;
  baseUrl?: string | null;
};

export abstract class StubAIProvider implements AIProvider {
  protected abstract readonly vendor: string;

  constructor(protected readonly credentials: AdapterCredentials = {}) {}

  chat(): Promise<AIResponse> {
    this.notImplemented('chat');
  }

  analyzeImage(): Promise<AIResponse> {
    this.notImplemented('analyzeImage');
  }

  embeddings(): Promise<AIResponse> {
    this.notImplemented('embeddings');
  }

  moderation(): Promise<AIResponse> {
    this.notImplemented('moderation');
  }

  private notImplemented(method: string): never {
    throw new NotImplementedException(
      `${this.vendor}.${method} is not implemented`,
    );
  }
}
