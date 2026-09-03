import type { AIProvider } from '../../src/shared/ai/ai-provider.interface';

export function describeProviderContract(
  name: string,
  factory: () => AIProvider,
) {
  describe(name, () => {
    it('exposes chat, analyzeImage, embeddings, moderation', () => {
      const p = factory();
      expect(typeof p.chat).toBe('function');
      expect(typeof p.analyzeImage).toBe('function');
      expect(typeof p.embeddings).toBe('function');
      expect(typeof p.moderation).toBe('function');
    });
  });
}
