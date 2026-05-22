import type { z } from 'zod';

export interface TextCompletionRequest {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TextProvider {
  readonly name: string;
  complete(request: TextCompletionRequest): Promise<string>;
  completeStructured<T>(
    request: TextCompletionRequest & { schema: z.ZodType<T> },
  ): Promise<T>;
}

export type TextProviderFactory = (config: TextProviderConfig) => TextProvider;

export interface TextProviderConfig {
  apiKey?: string | undefined;
  model?: string | undefined;
  maxRetries?: number | undefined;
}
