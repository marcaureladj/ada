import OpenAI from 'openai';
import { ModuleError, mp3Duration, type Language } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

const DEFAULT_MODEL_ENV = 'ADA_OPENAI_TTS_MODEL';
const DEFAULT_MODEL = 'tts-1';

// OpenAI's pre-made multilingual voice set (as of mid-2026).
const OPENAI_VOICES: ReadonlyArray<string> = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
];

const VOICE_ALIASES: Record<string, string> = {
  'french-pro-male': 'onyx',
  'french-pro-female': 'nova',
  'english-pro-male': 'onyx',
  'english-pro-female': 'nova',
};

function resolveVoice(voice: string | undefined): OpenAI.Audio.SpeechCreateParams['voice'] {
  if (!voice) return 'alloy';
  const aliased = VOICE_ALIASES[voice] ?? voice;
  if (!OPENAI_VOICES.includes(aliased)) return 'alloy';
  return aliased as OpenAI.Audio.SpeechCreateParams['voice'];
}

export interface OpenAiTtsClientLike {
  audio: {
    speech: {
      create(params: OpenAI.Audio.SpeechCreateParams): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
}

export interface OpenAiTtsProviderInternalDeps {
  client?: OpenAiTtsClientLike;
}

function makeClient(config: TtsProviderConfig): OpenAI {
  const apiKey = config.apiKey ?? process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new ModuleError(
      'TtsProvider:openai',
      'OPENAI_API_KEY manquant. Définissez-le dans votre .env.',
    );
  }
  return new OpenAI({ apiKey });
}

function lazyClient(
  config: TtsProviderConfig,
  injected: OpenAiTtsClientLike | undefined,
): () => OpenAiTtsClientLike {
  if (injected) return () => injected;
  let cached: OpenAI | undefined;
  return () => (cached ??= makeClient(config));
}

export function createOpenAiTtsProvider(
  config: TtsProviderConfig,
  internalDeps: OpenAiTtsProviderInternalDeps = {},
): TtsProvider {
  const getClient = lazyClient(config, internalDeps.client);
  const model = process.env[DEFAULT_MODEL_ENV] ?? DEFAULT_MODEL;

  return {
    name: 'openai-tts',
    async synthesize(request: TtsSynthesisRequest): Promise<TtsResult> {
      const voice = resolveVoice(request.voice);
      const response = await getClient().audio.speech.create({
        model,
        voice,
        input: request.text,
        response_format: 'mp3',
      });
      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const durationSec = mp3Duration(audio);
      return { audio, mimeType: 'audio/mpeg', durationSec };
    },
    async listVoices(_language: Language): Promise<string[]> {
      return [...OPENAI_VOICES, ...Object.keys(VOICE_ALIASES)];
    },
  };
}
