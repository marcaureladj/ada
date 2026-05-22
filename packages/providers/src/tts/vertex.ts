import { ModuleError, mp3Duration, withRetry, type Language } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

const KEY_ENV = 'ADA_VERTEX_API_KEY';
const MODEL_ENV = 'ADA_VERTEX_TTS_MODEL';
const DEFAULT_VOICE_BY_LANG: Record<Language, string> = {
  fr: 'fr-FR-Neural2-A',
  en: 'en-US-Neural2-A',
};

const VOICE_ALIASES: Record<string, string> = {
  'french-pro-male': 'fr-FR-Neural2-D',
  'french-pro-female': 'fr-FR-Neural2-A',
  'english-pro-male': 'en-US-Neural2-D',
  'english-pro-female': 'en-US-Neural2-F',
};

const LANGUAGE_CODE: Record<Language, string> = {
  fr: 'fr-FR',
  en: 'en-US',
};

function resolveVoice(voice: string | undefined, language: Language): string {
  if (!voice) return process.env[MODEL_ENV] ?? DEFAULT_VOICE_BY_LANG[language];
  return VOICE_ALIASES[voice] ?? voice;
}

class HttpError extends Error {
  readonly status: number;
  readonly headers: Record<string, string>;
  constructor(status: number, statusText: string, body: string, headers: Record<string, string>) {
    super(`Vertex TTS HTTP ${status} ${statusText}: ${body}`);
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

export interface VertexTtsInternalDeps {
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
}

export function createVertexTtsProvider(
  config: TtsProviderConfig,
  internalDeps: VertexTtsInternalDeps = {},
): TtsProvider {
  const fetchImpl = internalDeps.fetchImpl ?? fetch;

  return {
    name: 'vertex-tts',
    async synthesize(request: TtsSynthesisRequest): Promise<TtsResult> {
      const apiKey = config.apiKey ?? process.env[KEY_ENV];
      if (!apiKey) {
        throw new ModuleError(
          'TtsProvider:vertex-tts',
          `${KEY_ENV} manquant. Définissez-le dans votre .env (Google Cloud TTS API key).`,
        );
      }

      const voiceName = resolveVoice(request.voice, request.language);
      const languageCode = LANGUAGE_CODE[request.language];
      const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`;
      const sink = config.eventSink;

      const { result, stats } = await withRetry(
        async () => {
          const response = await fetchImpl(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              input: { text: request.text },
              voice: { languageCode, name: voiceName },
              audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 44100 },
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
          const payload = (await response.json()) as { audioContent?: string };
          if (!payload.audioContent) {
            throw new ModuleError(
              'TtsProvider:vertex-tts',
              `Réponse Vertex sans audioContent : ${JSON.stringify(payload).slice(0, 200)}`,
            );
          }
          return Buffer.from(payload.audioContent, 'base64');
        },
        {
          maxAttempts: 3,
          onAttempt: (attempt, error, delayMs) => {
            sink?.emit({
              level: 'warn',
              type: 'api.vertex-tts.retry',
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
        type: 'api.vertex-tts.call',
        payload: { attempts: stats.attempts, totalDelayMs: stats.totalDelayMs },
      });

      const audio = result;
      const durationSec = mp3Duration(audio);
      return { audio, mimeType: 'audio/mpeg', durationSec };
    },

    async listVoices(language: Language): Promise<string[]> {
      const prefix = language === 'fr' ? 'fr-FR' : 'en-US';
      return [
        `${prefix}-Neural2-A`,
        `${prefix}-Neural2-B`,
        `${prefix}-Neural2-C`,
        `${prefix}-Neural2-D`,
        `${prefix}-Neural2-E`,
        `${prefix}-Neural2-F`,
        ...Object.keys(VOICE_ALIASES).filter((k) =>
          k.startsWith(language === 'fr' ? 'french' : 'english'),
        ),
      ];
    },
  };
}
