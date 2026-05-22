import { NotImplementedError } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

// Replicate hosts many TTS models (xtts-v2, parler, etc.) via its prediction
// API. Stub for now — Replicate's create-then-poll flow differs from a
// simple synchronous REST call.
export function createReplicateTtsProvider(_config: TtsProviderConfig): TtsProvider {
  return {
    name: 'replicate-tts',
    async synthesize(_request: TtsSynthesisRequest): Promise<TtsResult> {
      throw new NotImplementedError(
        'TtsProvider:replicate-tts — utilisez fal-tts ou openai-tts en attendant.',
      );
    },
    async listVoices() {
      return [];
    },
  };
}
