import { NotImplementedError, type Language } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsSynthesisRequest } from './index.js';

export function createKokoroProvider(config: TtsProviderConfig): TtsProvider {
  return {
    name: 'kokoro',
    async synthesize(_request: TtsSynthesisRequest) {
      void config;
      throw new NotImplementedError('TtsProvider:kokoro.synthesize');
    },
    async listVoices(_language: Language) {
      throw new NotImplementedError('TtsProvider:kokoro.listVoices');
    },
  };
}
