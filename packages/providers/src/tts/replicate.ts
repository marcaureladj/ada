import { ModuleError, mp3Duration, withRetry, type Language } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

const KEY_ENV = 'ADA_REPLICATE_API_KEY';
const MODEL_ENV = 'ADA_REPLICATE_TTS_MODEL';
const VERSION_ENV = 'ADA_REPLICATE_TTS_VERSION';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

// Default model + version. The version pins xtts-v2; users can override via env.
const DEFAULT_MODEL = 'lucataco/xtts-v2';
const DEFAULT_VERSION = 'e7e09ff7e6e5e2c5d4b54fab2b6dbb4dd0e95d6f4ee2e9c52ed0c9e8d0b5b5b5';

const LANGUAGE_CODE: Record<Language, string> = {
  fr: 'fr',
  en: 'en',
};

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string, body: string) {
    super(`Replicate HTTP ${status} ${statusText}: ${body}`);
    this.status = status;
  }
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string | null;
  urls?: { get?: string };
}

export interface ReplicateTtsInternalDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createReplicateTtsProvider(
  config: TtsProviderConfig,
  internalDeps: ReplicateTtsInternalDeps = {},
): TtsProvider {
  const fetchImpl = internalDeps.fetchImpl ?? fetch;
  const sleep = internalDeps.sleep ?? defaultSleep;

  async function pollUntilTerminal(
    url: string,
    apiKey: string,
    startedAt: number,
  ): Promise<ReplicatePrediction> {
    while (true) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new ModuleError(
          'TtsProvider:replicate-tts',
          `polling timeout after ${POLL_TIMEOUT_MS}ms`,
        );
      }
      const response = await fetchImpl(url, {
        headers: { Authorization: `Token ${apiKey}` },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '<no body>');
        throw new HttpError(response.status, response.statusText, body);
      }
      const prediction = (await response.json()) as ReplicatePrediction;
      if (
        prediction.status === 'succeeded' ||
        prediction.status === 'failed' ||
        prediction.status === 'canceled'
      ) {
        return prediction;
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  return {
    name: 'replicate-tts',
    async synthesize(request: TtsSynthesisRequest): Promise<TtsResult> {
      const apiKey = config.apiKey ?? process.env[KEY_ENV];
      if (!apiKey) {
        throw new ModuleError(
          'TtsProvider:replicate-tts',
          `${KEY_ENV} manquant. Définissez-le dans votre .env.`,
        );
      }
      const model = process.env[MODEL_ENV] ?? DEFAULT_MODEL;
      const version = process.env[VERSION_ENV] ?? DEFAULT_VERSION;
      const sink = config.eventSink;

      const { result, stats } = await withRetry(
        async () => {
          // 1) Create prediction
          const createResponse = await fetchImpl('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              Authorization: `Token ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version,
              input: {
                text: request.text,
                language: LANGUAGE_CODE[request.language],
                speaker: request.voice ?? 'default',
              },
            }),
          });
          if (!createResponse.ok) {
            const body = await createResponse.text().catch(() => '<no body>');
            throw new HttpError(createResponse.status, createResponse.statusText, body);
          }
          const created = (await createResponse.json()) as ReplicatePrediction;
          const getUrl =
            created.urls?.get ?? `https://api.replicate.com/v1/predictions/${created.id}`;

          // 2) Poll until terminal
          const final = await pollUntilTerminal(getUrl, apiKey, Date.now());
          if (final.status !== 'succeeded') {
            throw new ModuleError(
              'TtsProvider:replicate-tts',
              `prediction ${final.status} (model ${model}): ${final.error ?? 'unknown'}`,
            );
          }
          const output = final.output;
          const audioUrl = Array.isArray(output) ? output[0] : output;
          if (!audioUrl || typeof audioUrl !== 'string') {
            throw new ModuleError(
              'TtsProvider:replicate-tts',
              `prediction succeeded mais output invalide : ${JSON.stringify(output).slice(0, 200)}`,
            );
          }

          // 3) Fetch audio
          const audioResponse = await fetchImpl(audioUrl);
          if (!audioResponse.ok) {
            const body = await audioResponse.text().catch(() => '<no body>');
            throw new HttpError(audioResponse.status, audioResponse.statusText, body);
          }
          return Buffer.from(await audioResponse.arrayBuffer());
        },
        {
          maxAttempts: 3,
          onAttempt: (attempt, error, delayMs) => {
            sink?.emit({
              level: 'warn',
              type: 'api.replicate-tts.retry',
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
        type: 'api.replicate-tts.call',
        payload: { attempts: stats.attempts, totalDelayMs: stats.totalDelayMs },
      });

      const audio = result;
      const durationSec = mp3Duration(audio);
      return { audio, mimeType: 'audio/mpeg', durationSec };
    },

    async listVoices(_language: Language): Promise<string[]> {
      // xtts-v2 supports a fixed speaker list; depends on the model variant.
      return ['default', 'Aaron Dreschner', 'Daisy Studious', 'Henriette Usha'];
    },
  };
}
