import { Module } from '@nestjs/common';
import { AiProviderFactory } from './ai-provider.factory';
import { FakeAIProvider } from './fake.provider';

@Module({
  providers: [AiProviderFactory, FakeAIProvider],
  exports: [AiProviderFactory, FakeAIProvider],
})
export class AiModule {}
