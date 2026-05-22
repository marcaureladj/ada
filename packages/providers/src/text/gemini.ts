import { NotImplementedError } from '@ada/core';
import type { z } from 'zod';
import type { TextCompletionRequest, TextProvider, TextProviderConfig } from './index.js';

export function createGeminiTextProvider(config: TextProviderConfig): TextProvider {
  return {
    name: 'gemini',
    async complete(_request: TextCompletionRequest) {
      void config;
      throw new NotImplementedError('TextProvider:gemini.complete');
    },
    async completeStructured<T>(_request: TextCompletionRequest & { schema: z.ZodType<T> }) {
      throw new NotImplementedError('TextProvider:gemini.completeStructured');
    },
  };
}
