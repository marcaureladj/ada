import { ConfigError } from '@ada/core';
import type { VisionProvider, VisionProviderConfig } from './vision/index.js';
import type { TextProvider, TextProviderConfig } from './text/index.js';
import type { TtsProvider, TtsProviderConfig } from './tts/index.js';

import { createClaudeComputerUseProvider } from './vision/claude.js';
import { createGpt4VisionProvider } from './vision/gpt4.js';
import { createGeminiVisionProvider } from './vision/gemini.js';
import { createQwenVisionProvider } from './vision/qwen.js';
import { createMockVisionProvider } from './vision/mock.js';

import { createClaudeTextProvider } from './text/claude.js';
import { createOpenAiTextProvider } from './text/openai.js';
import { createGeminiTextProvider } from './text/gemini.js';
import { createOllamaTextProvider } from './text/ollama.js';
import { createMockTextProvider } from './text/mock.js';

import { createElevenLabsProvider } from './tts/elevenlabs.js';
import { createOpenAiTtsProvider } from './tts/openai.js';
import { createKokoroProvider } from './tts/kokoro.js';
import { createMockTtsProvider } from './tts/mock.js';

const visionRegistry: Record<string, (c: VisionProviderConfig) => VisionProvider> = {
  'claude-computer-use': createClaudeComputerUseProvider,
  'gpt-4-vision': createGpt4VisionProvider,
  'gemini-vision': createGeminiVisionProvider,
  'qwen2-vl-local': createQwenVisionProvider,
  'mock-vision': createMockVisionProvider,
};

const textRegistry: Record<string, (c: TextProviderConfig) => TextProvider> = {
  claude: createClaudeTextProvider,
  openai: createOpenAiTextProvider,
  gemini: createGeminiTextProvider,
  ollama: createOllamaTextProvider,
  'mock-text': createMockTextProvider,
};

const ttsRegistry: Record<string, (c: TtsProviderConfig) => TtsProvider> = {
  elevenlabs: createElevenLabsProvider,
  'openai-tts': createOpenAiTtsProvider,
  kokoro: createKokoroProvider,
  'mock-tts': createMockTtsProvider,
};

export function resolveVisionProvider(name: string, config: VisionProviderConfig): VisionProvider {
  const factory = visionRegistry[name];
  if (!factory) {
    throw new ConfigError(
      `Unknown vision provider "${name}". Known: ${Object.keys(visionRegistry).join(', ')}.`,
    );
  }
  return factory(config);
}

export function resolveTextProvider(name: string, config: TextProviderConfig): TextProvider {
  const factory = textRegistry[name];
  if (!factory) {
    throw new ConfigError(
      `Unknown text provider "${name}". Known: ${Object.keys(textRegistry).join(', ')}.`,
    );
  }
  return factory(config);
}

export function resolveTtsProvider(name: string, config: TtsProviderConfig): TtsProvider {
  const factory = ttsRegistry[name];
  if (!factory) {
    throw new ConfigError(
      `Unknown TTS provider "${name}". Known: ${Object.keys(ttsRegistry).join(', ')}.`,
    );
  }
  return factory(config);
}

export const listProviders = {
  vision: () => Object.keys(visionRegistry),
  text: () => Object.keys(textRegistry),
  tts: () => Object.keys(ttsRegistry),
};
