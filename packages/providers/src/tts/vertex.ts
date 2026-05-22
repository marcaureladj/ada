import { NotImplementedError } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

// Google Cloud Text-to-Speech via Vertex AI. Stub for now — the Cloud
// Text-to-Speech REST API differs from the OpenAI Chat surface, so it
// deserves its own integration (session 10+).
export function createVertexTtsProvider(_config: TtsProviderConfig): TtsProvider {
  return {
    name: 'vertex-tts',
    async synthesize(_request: TtsSynthesisRequest): Promise<TtsResult> {
      throw new NotImplementedError(
        'TtsProvider:vertex-tts — utilisez fal-tts ou openai-tts en attendant.',
      );
    },
    async listVoices() {
      return [];
    },
  };
}
