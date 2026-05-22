import {
  createAuthModule,
  createPlanner,
  createNavigator,
  createScreenshotRedactor,
  createScripter,
  createVoicer,
  createComposer,
  type PipelineDeps,
  type RunConfig,
} from '@ada/core';
import {
  resolveTextProvider,
  resolveTtsProvider,
  resolveVisionProvider,
} from '@ada/providers';
import { resolveTemplate } from '@ada/templates';

// Build the pipeline dependency graph from a parsed RunConfig. Pulls API keys
// from process.env and injects them into the providers. When ADA_MOCK=1, all
// three providers are swapped for in-memory mocks (no network, no API keys).
export function buildPipelineDeps(config: RunConfig): PipelineDeps {
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  const elevenLabsKey = process.env['ELEVENLABS_API_KEY'];
  const cacheDir = process.env['ADA_CACHE_DIR'] ?? '.ada-cache';
  const mockMode = process.env['ADA_MOCK'] === '1';

  if (mockMode) {
    config.providers.vision = 'mock-vision';
    config.providers.text = 'mock-text';
    config.providers.tts = 'mock-tts';
  }

  const visionProvider = resolveVisionProvider(config.providers.vision, {
    apiKey: anthropicKey,
  });
  const textProvider = resolveTextProvider(config.providers.text, { apiKey: anthropicKey });
  const ttsProvider = resolveTtsProvider(config.providers.tts, {
    apiKey: elevenLabsKey,
    cacheDir,
  });

  const authModule = createAuthModule();
  const redactor = createScreenshotRedactor();

  return {
    planner: createPlanner({ provider: textProvider }),
    navigator: createNavigator({
      provider: visionProvider,
      authModule,
      redactor,
    }),
    scripter: createScripter({ provider: textProvider }),
    voicer: createVoicer({ provider: ttsProvider, cacheDir }),
    composer: createComposer({ resolveTemplate }),
  };
}
