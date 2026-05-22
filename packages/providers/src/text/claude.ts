import Anthropic from '@anthropic-ai/sdk';
import { ModuleError, withRetry } from '@ada/core';
import type { z } from 'zod';
import type { TextCompletionRequest, TextProvider, TextProviderConfig } from './index.js';
import {
  buildStructuredSystem,
  tryParseStructured,
} from './structured.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function makeClient(config: TextProviderConfig): Anthropic {
  const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new ModuleError(
      'TextProvider:claude',
      'ANTHROPIC_API_KEY manquant. Définissez-le dans votre .env.',
    );
  }
  // SDK retries disabled — withRetry below owns the retry policy.
  return new Anthropic({ apiKey, maxRetries: 0 });
}

function lazyClient(config: TextProviderConfig): () => Anthropic {
  let cached: Anthropic | undefined;
  return () => (cached ??= makeClient(config));
}

function callWithRetry<T>(
  config: TextProviderConfig,
  providerName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const sink = config.eventSink;
  return withRetry(fn, {
    maxAttempts: config.maxRetries !== undefined ? config.maxRetries + 1 : 3,
    onAttempt: (attempt, error, delayMs) => {
      sink?.emit({
        level: 'warn',
        type: `api.${providerName}.retry`,
        payload: {
          attempt,
          delayMs,
          error: (error as Error)?.message ?? String(error),
        },
      });
    },
  }).then(({ result, stats }) => {
    sink?.emit({
      level: 'debug',
      type: `api.${providerName}.call`,
      payload: { attempts: stats.attempts, totalDelayMs: stats.totalDelayMs },
    });
    return result;
  });
}

function extractText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export function createClaudeTextProvider(config: TextProviderConfig): TextProvider {
  const getClient = lazyClient(config);
  const model = config.model ?? DEFAULT_MODEL;
  const maxRetries = config.maxRetries ?? 1;

  return {
    name: 'claude',
    async complete(request: TextCompletionRequest): Promise<string> {
      const message = await callWithRetry(config, 'anthropic', () =>
        getClient().messages.create({
          model,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
          ...(request.system !== undefined ? { system: request.system } : {}),
          messages: [{ role: 'user', content: request.prompt }],
        }),
      );
      return extractText(message);
    },

    async completeStructured<T>(
      request: TextCompletionRequest & { schema: z.ZodType<T> },
    ): Promise<T> {
      const system = buildStructuredSystem(request.system);
      let attempt = 0;
      let lastFeedback = '';

      while (attempt <= maxRetries) {
        const message = await callWithRetry(config, 'anthropic', () =>
          getClient().messages.create({
            model,
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.3,
            system,
            messages: [
              {
                role: 'user',
                content: lastFeedback
                  ? `${request.prompt}\n\nCORRECTION: ${lastFeedback}`
                  : request.prompt,
              },
            ],
          }),
        );
        const raw = extractText(message);
        const result = tryParseStructured(request.schema, raw);
        if (result.ok) return result.data;
        lastFeedback = result.feedback;
        attempt += 1;
      }

      throw new ModuleError(
        'TextProvider:claude',
        `completeStructured a échoué après ${maxRetries + 1} tentatives : ${lastFeedback}`,
      );
    },
  };
}
