import { NotImplementedError } from '@ada/core';
import type { z } from 'zod';
import type { TextCompletionRequest, TextProvider, TextProviderConfig } from './index.js';

export function createOllamaTextProvider(config: TextProviderConfig): TextProvider {
  return {
    name: 'ollama',
    async complete(_request: TextCompletionRequest) {
      void config;
      throw new NotImplementedError('TextProvider:ollama.complete');
    },
    async completeStructured<T>(_request: TextCompletionRequest & { schema: z.ZodType<T> }) {
      throw new NotImplementedError('TextProvider:ollama.completeStructured');
    },
  };
}
