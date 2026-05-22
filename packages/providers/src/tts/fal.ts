import { ModuleError, mp3Duration, withRetry, type Language } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

const DEFAULT_MODEL_ENV = 'ADA_FAL_TTS_MODEL';
const DEFAULT_MODEL = 'fal-ai/kokoro';
const DEFAULT_URL_ENV = 'ADA_FAL_API_URL';
const DEFAULT_URL = 'https://fal.run';
const KEY_ENV = 'ADA_FAL_API_KEY';

// Fal voice aliases mapped to Kokoro voices (most popular OSS TTS model).
// Other Fal-hosted models may ignore these — users can pass a raw voice id.
const VOICE_ALIASES: Record<string, string> = {
  'french-pro-male': 'ff_siwis',
  'french-pro-female': 'ff_siwis',
  'english-pro-male': 'am_michael',
  'english-pro-female': 'af_bella',
};

class HttpError extends Error {
  readonly status: number;
  readonly headers: Record<string, string>;
  constructor(status: number, statusText: string, body: string, headers: Record<string, string>) {
    super(`Fal HTTP ${status} ${statusText}: ${body}`);
    this.status = status;
    this.headers = headers;
  }
}

function headersToObject(h: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  h.forEach((v, k) => {
    obj[k.toLowerCase()] = v;
  });
  return obj;
}

function resolveVoice(voice: string | undefined): string {
  if (!voice) return 'af_bella';
  return VOICE_ALIASES[voice] ?? voice;
}

export function createFalTtsProvider(config: TtsProviderConfig): TtsProvider {
  return {
    name: 'fal-tts',
    async synthesize(request: TtsSynthesisRequest): Promise<TtsResult> {
      const apiKey = config.apiKey ?? process.env[KEY_ENV];
      if (!apiKey) {
        throw new ModuleError(
          'TtsProvider:fal',
          `${KEY_ENV} manquant. Définissez-le dans votre .env.`,
        );
      }
      const baseUrl = (process.env[DEFAULT_URL_ENV] ?? DEFAULT_URL).replace(/\/$/, '');
      const model = process.env[DEFAULT_MODEL_ENV] ?? DEFAULT_MODEL;
      const url = `${baseUrl}/${model}`;

      const sink = config.eventSink;
      const { result, stats } = await withRetry(
        async () => {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Key ${apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg',
            },
            body: JSON.stringify({
              prompt: request.text,
              text: request.text,
              voice: resolveVoice(request.voice),
              speed: 1.0,
            }),
          });
          if (!response.ok) {
            const body = await response.text().catch(() => '<no body>');
            throw new HttpError(
              response.status,
              response.statusText,
              body,
              headersToObject(response.headers),
            );
          }
          // Fal can respond either with a binary audio body or a JSON
          // { audio: { url: "..." } }. We sniff the content-type.
          const contentType = response.headers.get('content-type') ?? '';
          if (contentType.includes('application/json')) {
            const payload = (await response.json()) as { audio?: { url?: string } };
            const audioUrl = payload.audio?.url;
            if (!audioUrl) {
              throw new ModuleError(
                'TtsProvider:fal',
                `Réponse Fal sans audio.url : ${JSON.stringify(payload).slice(0, 200)}`,
              );
            }
            const audioResponse = await fetch(audioUrl);
            return Buffer.from(await audioResponse.arrayBuffer());
          }
          return Buffer.from(await response.arrayBuffer());
        },
        {
          maxAttempts: 3,
          onAttempt: (attempt, error, delayMs) => {
            sink?.emit({
              level: 'warn',
              type: 'api.fal.retry',
              payload: {
                attempt,
                delayMs,
                error: (error as Error)?.message ?? String(error),
              },
            });
          },
        },
      );
      sink?.emit({
        level: 'debug',
        type: 'api.fal.call',
        payload: { attempts: stats.attempts, totalDelayMs: stats.totalDelayMs },
      });

      const audio = result;
      const durationSec = mp3Duration(audio);
      return { audio, mimeType: 'audio/mpeg', durationSec };
    },

    async listVoices(_language: Language): Promise<string[]> {
      return [...Object.keys(VOICE_ALIASES), 'af_bella', 'am_michael', 'ff_siwis'];
    },
  };
}
