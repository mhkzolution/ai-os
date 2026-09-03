import type {
  AIResponse,
  ChatRequest,
  EmbeddingRequest,
  ImageRequest,
  ModerationRequest,
} from './ai-response';

export interface AIProvider {
  chat(request: ChatRequest): Promise<AIResponse>;
  analyzeImage(request: ImageRequest): Promise<AIResponse>;
  embeddings(request: EmbeddingRequest): Promise<AIResponse>;
  moderation(request: ModerationRequest): Promise<AIResponse>;
}
