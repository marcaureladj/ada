import { ModuleError, mp3Duration, withRetry, type Language } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

const DEFAULT_VOICES: Record<Language, string> = {
  fr: 'JBFqnCBsd6RMkjVDRZzb',
  en: '21m00Tcm4TlvDq8ikWAM',
};

const VOICE_ALIASES: Record<string, string> = {
  'french-pro-male': 'JBFqnCBsd6RMkjVDRZzb',
  'french-pro-female': 'XB0fDUnXU5powFXDhCwa',
  'english-pro-male': 'pNInz6obpgDQGcFmaJgB',
  'english-pro-female': '21m00Tcm4TlvDq8ikWAM',
};

function resolveVoiceId(voice: string | undefined, language: Language): string {
  if (!voice) return DEFAULT_VOICES[language];
  if (VOICE_ALIASES[voice]) return VOICE_ALIASES[voice]!;
  return voice;
}

// Custom transient classifier for our HTTP layer: we wrap the response in a
// thrown object with .status so the generic isTransient classifier matches.
class HttpError extends Error {
  readonly status: number;
  readonly headers: Record<string, string>;
  constructor(status: number, statusText: string, body: string, headers: Record<string, string>) {
    super(`HTTP ${status} ${statusText}: ${body}`);
    this.status = status;
    this.headers = headers;
  }
}

function headersToObject(h: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  h.forEach((value, key) => {
    obj[key.toLowerCase()] = value;
  });
  return obj;
}

export function createElevenLabsProvider(config: TtsProviderConfig): TtsProvider {
  return {
    name: 'elevenlabs',
    async synthesize(request: TtsSynthesisRequest): Promise<TtsResult> {
      if (!config.apiKey) {
        throw new ModuleError(
          'Voicer:elevenlabs',
          'ELEVENLABS_API_KEY manquant. Définissez-le dans votre .env.',
        );
      }
      const voiceId = resolveVoiceId(request.voice, request.language);
      const model =
        process.env['ADA_ELEVENLABS_MODEL'] ?? 'eleven_multilingual_v2';
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

      const sink = config.eventSink;
      const { result, stats } = await withRetry(
        async () => {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'xi-api-key': config.apiKey!,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg',
            },
            body: JSON.stringify({
              text: request.text,
              model_id: model,
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
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
          return Buffer.from(await response.arrayBuffer());
        },
        {
          maxAttempts: 3,
          onAttempt: (attempt, error, delayMs) => {
            sink?.emit({
              level: 'warn',
              type: 'api.elevenlabs.retry',
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
        type: 'api.elevenlabs.call',
        payload: { attempts: stats.attempts, totalDelayMs: stats.totalDelayMs },
      });
      const audio = result;
      const durationSec = mp3Duration(audio);
      return { audio, mimeType: 'audio/mpeg', durationSec };
    },

    async listVoices(language: Language): Promise<string[]> {
      const base = Object.keys(VOICE_ALIASES).filter((k) => k.startsWith(language));
      return base.length > 0 ? base : Object.keys(VOICE_ALIASES);
    },
  };
}
