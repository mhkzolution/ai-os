export interface AIResponse {
  content: unknown;
  raw: unknown;
  tokensInput: number;
  tokensOutput: number;
}

export interface ChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}

export interface ImageRequest {
  model: string;
  images: string[];
  prompt?: string;
  signal?: AbortSignal;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  signal?: AbortSignal;
}

export interface ModerationRequest {
  model: string;
  input: string;
  signal?: AbortSignal;
}
