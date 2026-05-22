import OpenAI from 'openai';
import { ModuleError } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';
import { runScreenshotJsonLoop } from './screenshot-json.js';

const KEY_ENV = 'ADA_VERTEX_API_KEY';
const URL_ENV = 'ADA_VERTEX_API_URL';
const MODEL_ENV = 'ADA_VERTEX_VISION_MODEL';
const DEFAULT_MODEL = 'google/gemini-2.5-pro';

export interface VertexVisionInternalDeps {
  client?: {
    chat: {
      completions: {
        create(params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.ChatCompletion>;
      };
    };
  };
}

export function createVertexVisionProvider(
  config: VisionProviderConfig,
  internalDeps: VertexVisionInternalDeps = {},
): VisionProvider {
  const model = config.model ?? process.env[MODEL_ENV] ?? DEFAULT_MODEL;

  let cachedClient: OpenAI | undefined;
  const getClient = (): NonNullable<VertexVisionInternalDeps['client']> => {
    if (internalDeps.client) return internalDeps.client;
    if (cachedClient) return cachedClient;
    const apiKey = config.apiKey ?? process.env[KEY_ENV];
    const baseURL = process.env[URL_ENV];
    if (!baseURL) {
      throw new ModuleError(
        'VisionProvider:vertex-vision',
        `${URL_ENV} manquant. Définissez-le dans votre .env (Vertex AI OpenAI-compatible endpoint).`,
      );
    }
    if (!apiKey) {
      throw new ModuleError(
        'VisionProvider:vertex-vision',
        `${KEY_ENV} manquant. Définissez-le dans votre .env.`,
      );
    }
    cachedClient = new OpenAI({ apiKey, baseURL, maxRetries: 0 });
    return cachedClient;
  };

  return {
    name: 'vertex-vision',
    async runComputerLoop(input: VisionRunInput): Promise<VisionRunResult> {
      return runScreenshotJsonLoop(
        input,
        {
          name: 'vertex-vision',
          async callVision({ system, userText, screenshotPng }) {
            const client = getClient();
            const response = await client.chat.completions.create({
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
