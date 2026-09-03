import { Injectable } from '@nestjs/common';
import type { AIProvider } from '../../../shared/ai/ai-provider.interface';
import type { ImageRequest } from '../../../shared/ai/ai-response';

@Injectable()
export class ProductAnalysisHandler {
  execute(provider: AIProvider, request: ImageRequest) {
    return provider.analyzeImage(request);
  }
}
