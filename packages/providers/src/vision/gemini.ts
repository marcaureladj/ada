import { ModuleError, withRetry } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';
import { runScreenshotJsonLoop } from './screenshot-json.js';

const KEY_ENV = 'GOOGLE_API_KEY';
const MODEL_ENV = 'ADA_GEMINI_VISION_MODEL';
const DEFAULT_MODEL = 'gemini-2.5-pro';

export interface GeminiVisionInternalDeps {
  fetchImpl?: typeof fetch;
}

interface GeminiContent {
  parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  >;
  role?: 'user' | 'model';
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export function createGeminiVisionProvider(
  config: VisionProviderConfig,
  internalDeps: GeminiVisionInternalDeps = {},
): VisionProvider {
  const fetchImpl = internalDeps.fetchImpl ?? fetch;
  const model = config.model ?? process.env[MODEL_ENV] ?? DEFAULT_MODEL;

  return {
    name: 'gemini-vision',
    async runComputerLoop(input: VisionRunInput): Promise<VisionRunResult> {
      return runScreenshotJsonLoop(
        input,
        {
          name: 'gemini-vision',
          async callVision({ system, userText, screenshotPng }) {
            const apiKey = config.apiKey ?? process.env[KEY_ENV];
            if (!apiKey) {
              throw new ModuleError(
                'VisionProvider:gemini-vision',
                `${KEY_ENV} manquant. Définissez-le dans votre .env.`,
              );
            }
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
              model,
            )}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const body = {
              system_instruction: { parts: [{ text: system }] },
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: userText },
                    {
                      inline_data: {
                        mime_type: 'image/png',
                        data: screenshotPng.toString('base64'),
                      },
                    },
                  ],
                } satisfies GeminiContent,
              ],
              generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
            };

            // Inner call uses fetch (not retry-wrapped; the outer
            // runScreenshotJsonLoop retries the whole callVision via withRetry).
            const response = await fetchImpl(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (!response.ok) {
              const text = await response.text().catch(() => '<no body>');
              const err = new Error(`Gemini HTTP ${response.status}: ${text}`) as Error & {
                status: number;
              };
              err.status = response.status;
              throw err;
            }
            const payload = (await response.json()) as GeminiResponse;
            const rawText = payload.candidates
              ?.flatMap((c) => c.content?.parts ?? [])
              .map((p) => p.text ?? '')
              .filter(Boolean)
              .join('\n') ?? '';
            return { rawText };
          },
        },
        config,
      );
      // withRetry is unused here; retry happens inside runScreenshotJsonLoop's onAttempt.
      void withRetry;
    },
  };
}
