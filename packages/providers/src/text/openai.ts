import OpenAI from 'openai';
import { ModuleError } from '@ada/core';
import type { z } from 'zod';
import type { TextCompletionRequest, TextProvider, TextProviderConfig } from './index.js';
import { buildStructuredSystem, tryParseStructured } from './structured.js';

const DEFAULT_MODEL = 'gpt-4o';

// Subset of the OpenAI client surface we actually use. Lets tests inject a
// minimal stub without depending on the full SDK shape.
export interface OpenAiClientLike {
  chat: {
    completions: {
      create(params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.ChatCompletion>;
    };
  };
}

export interface OpenAiTextProviderInternalDeps {
  client?: OpenAiClientLike;
}

function makeClient(config: TextProviderConfig): OpenAI {
  const apiKey = config.apiKey ?? process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new ModuleError(
      'TextProvider:openai',
      'OPENAI_API_KEY manquant. Définissez-le dans votre .env.',
    );
  }
  return new OpenAI({ apiKey });
}

function lazyClient(
  config: TextProviderConfig,
  injected: OpenAiClientLike | undefined,
): () => OpenAiClientLike {
  if (injected) return () => injected;
  let cached: OpenAI | undefined;
  return () => (cached ??= makeClient(config));
}

function extractText(message: OpenAI.Chat.ChatCompletion): string {
  return message.choices.map((c) => c.message.content ?? '').filter(Boolean).join('\n');
}

export function createOpenAiTextProvider(
  config: TextProviderConfig,
  internalDeps: OpenAiTextProviderInternalDeps = {},
): TextProvider {
  const getClient = lazyClient(config, internalDeps.client);
  const model = config.model ?? process.env['ADA_OPENAI_MODEL'] ?? DEFAULT_MODEL;
  const maxRetries = config.maxRetries ?? 1;

  return {
    name: 'openai',
    async complete(request: TextCompletionRequest): Promise<string> {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (request.system) messages.push({ role: 'system', content: request.system });
      messages.push({ role: 'user', content: request.prompt });

      const response = await getClient().chat.completions.create({
        model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
        messages,
      });
      return extractText(response);
    },

    async completeStructured<T>(
      request: TextCompletionRequest & { schema: z.ZodType<T> },
    ): Promise<T> {
      const system = buildStructuredSystem(request.system);
      let attempt = 0;
      let lastFeedback = '';

      while (attempt <= maxRetries) {
        const userMessage = lastFeedback
          ? `${request.prompt}\n\nCORRECTION: ${lastFeedback}`
          : request.prompt;
        const response = await getClient().chat.completions.create({
          model,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMessage },
          ],
        });
        const raw = extractText(response);
        const result = tryParseStructured(request.schema, raw);
        if (result.ok) return result.data;
        lastFeedback = result.feedback;
        attempt += 1;
      }

      throw new ModuleError(
        'TextProvider:openai',
        `completeStructured a échoué après ${maxRetries + 1} tentatives : ${lastFeedback}`,
      );
    },
  };
}
