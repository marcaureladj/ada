import type { Language } from '@ada/core';
import type { TtsProvider, TtsProviderConfig, TtsResult, TtsSynthesisRequest } from './index.js';

// Minimal MP3 frame: MPEG-1 Layer 3, 128 kbps, 44.1 kHz, no padding, mono.
// Header bytes 0xFF 0xFB 0x90 0x00 followed by 414 bytes of silent payload.
// Repeated 77 times → ~2.01 seconds, well-formed for any naive decoder.
const SILENT_FRAME_HEADER = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
const SILENT_FRAME_BODY = Buffer.alloc(414, 0);
const SILENT_FRAME = Buffer.concat([SILENT_FRAME_HEADER, SILENT_FRAME_BODY]);
const FRAMES_FOR_2S = 77;
const SILENT_MP3 = Buffer.concat(Array.from({ length: FRAMES_FOR_2S }, () => SILENT_FRAME));
const MOCK_DURATION_SEC = 2.0;

export function createMockTtsProvider(config: TtsProviderConfig): TtsProvider {
  return {
    name: 'mock-tts',
    async synthesize(_request: TtsSynthesisRequest): Promise<TtsResult> {
      void config;
      // Return a deterministic silent MP3 of known duration. Useful for
      // integration tests that exercise the whole pipeline without network.
      return {
        audio: SILENT_MP3,
        mimeType: 'audio/mpeg',
        durationSec: MOCK_DURATION_SEC,
      };
    },
    async listVoices(_language: Language): Promise<string[]> {
      return ['mock-voice'];
    },
  };
}
