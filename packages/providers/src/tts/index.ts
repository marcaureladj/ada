import type { Language } from '@ada/core';

export interface TtsSynthesisRequest {
  text: string;
  language: Language;
  voice: string;
  ssml?: boolean;
}

export interface TtsResult {
  audio: Buffer;
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/ogg';
  durationSec: number;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(request: TtsSynthesisRequest): Promise<TtsResult>;
  listVoices(language: Language): Promise<string[]>;
}

export type TtsProviderFactory = (config: TtsProviderConfig) => TtsProvider;

import type { EventSink } from '@ada/core';

export interface TtsProviderConfig {
  apiKey?: string | undefined;
  cacheDir?: string | undefined;
  eventSink?: EventSink | undefined;
}
