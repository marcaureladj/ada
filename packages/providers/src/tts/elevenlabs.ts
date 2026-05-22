import { ModuleError, mp3Duration, type Language } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

// Default voice IDs from ElevenLabs' standard pre-made library.
// Override via `providers.voice` in ada.yaml when you need something specific.
const DEFAULT_VOICES: Record<Language, string> = {
  fr: 'JBFqnCBsd6RMkjVDRZzb', // George — works for fr via eleven_multilingual_v2
  en: '21m00Tcm4TlvDq8ikWAM', // Rachel
};

const VOICE_ALIASES: Record<string, string> = {
  'french-pro-male': 'JBFqnCBsd6RMkjVDRZzb',
  'french-pro-female': 'XB0fDUnXU5powFXDhCwa', // Charlotte
  'english-pro-male': 'pNInz6obpgDQGcFmaJgB', // Adam
  'english-pro-female': '21m00Tcm4TlvDq8ikWAM', // Rachel
};

function resolveVoiceId(voice: string | undefined, language: Language): string {
  if (!voice) return DEFAULT_VOICES[language];
  if (VOICE_ALIASES[voice]) return VOICE_ALIASES[voice]!;
  return voice;
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
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': config.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: request.text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '<no body>');
        throw new ModuleError(
          'Voicer:elevenlabs',
          `ElevenLabs API ${response.status} ${response.statusText}: ${body}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const durationSec = mp3Duration(audio);

      return { audio, mimeType: 'audio/mpeg', durationSec };
    },

    async listVoices(language: Language): Promise<string[]> {
      // P1: minimal hard-coded list. v1.1 will hit /v1/voices for live data.
      const base = Object.keys(VOICE_ALIASES).filter((k) => k.startsWith(language));
      return base.length > 0 ? base : Object.keys(VOICE_ALIASES);
    },
  };
}
