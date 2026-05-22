import OpenAI from 'openai';
import { ModuleError } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';
import { runScreenshotJsonLoop } from './screenshot-json.js';

const DEFAULT_MODEL = 'gpt-4o';

export interface OpenAiVisionClientLike {
  chat: {
    completions: {
      create(params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.ChatCompletion>;
    };
  };
}

export interface Gpt4VisionInternalDeps {
  client?: OpenAiVisionClientLike;
}

function makeClient(config: VisionProviderConfig, providerName: string): OpenAI {
  const apiKey = config.apiKey ?? process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new ModuleError(
      `VisionProvider:${providerName}`,
      `OPENAI_API_KEY manquant. Définissez-le dans votre .env.`,
    );
  }
  return new OpenAI({ apiKey, maxRetries: 0 });
}

function lazyClient(
  config: VisionProviderConfig,
  injected: OpenAiVisionClientLike | undefined,
  providerName: string,
): () => OpenAiVisionClientLike {
  if (injected) return () => injected;
  let cached: OpenAI | undefined;
  return () => (cached ??= makeClient(config, providerName));
}

export function createGpt4VisionProvider(
  config: VisionProviderConfig,
  internalDeps: Gpt4VisionInternalDeps = {},
): VisionProvider {
  const getClient = lazyClient(config, internalDeps.client, 'gpt-4-vision');
  const model = config.model ?? process.env['ADA_OPENAI_MODEL'] ?? DEFAULT_MODEL;

  return {
    name: 'gpt-4-vision',
    async runComputerLoop(input: VisionRunInput): Promise<VisionRunResult> {
      return runScreenshotJsonLoop(
        input,
        {
          name: 'gpt-4-vision',
          async callVision({ system, userText, screenshotPng }) {
            const response = await getClient().chat.completions.create({
              model,
              max_tokens: 1024,
              temperature: 0.2,
              messages: [
                { role: 'system', content: system },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: userText },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:image/png;base64,${screenshotPng.toString('base64')}`,
                      },
                    },
                  ],
                },
              ],
            });
            const rawText = response.choices
              .map((c) => c.message.content ?? '')
              .filter(Boolean)
              .join('\n');
            return { rawText };
          },
        },
        config,
      );
    },
  };
}
