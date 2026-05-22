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

import type { EventSink } from '@ada/core';

export interface TextProviderConfig {
  apiKey?: string | undefined;
  model?: string | undefined;
  maxRetries?: number | undefined;
  eventSink?: EventSink | undefined;
  /** Custom base URL for OpenAI-compatible providers (Vertex, Fal, Replicate, …). */
  baseURL?: string | undefined;
  /** Logical name override exposed via provider.name (defaults to factory name). */
  nameOverride?: string | undefined;
}
