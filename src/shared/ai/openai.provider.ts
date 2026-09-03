import { StubAIProvider } from './stub.provider';

export class OpenAIProvider extends StubAIProvider {
  protected readonly vendor = 'OpenAIProvider';
}
