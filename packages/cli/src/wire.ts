import {
  createAuthModule,
  createPlanner,
  createNavigator,
  createRelayEventSink,
  createScreenshotRedactor,
  createScripter,
  createVoicer,
  createComposer,
  type PipelineDeps,
  type RelayEventSink,
  type RunConfig,
} from '@ada/core';
import {
  resolveTextProvider,
  resolveTtsProvider,
  resolveVisionProvider,
} from '@ada/providers';
import { resolveTemplate } from '@ada/templates';

export interface BuildPipelineDepsResult {
  deps: PipelineDeps;
  /** Pass this to runPipeline as options.eventSink so provider events land in events.ndjson. */
  providerSink: RelayEventSink;
}

// Build the pipeline dependency graph from a parsed RunConfig. Pulls API keys
// from process.env and injects them into the providers. When ADA_MOCK=1, all
// three providers are swapped for in-memory mocks (no network, no API keys).
export function buildPipelineDeps(config: RunConfig): BuildPipelineDepsResult {
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  const openaiKey = process.env['OPENAI_API_KEY'];
  const elevenLabsKey = process.env['ELEVENLABS_API_KEY'];
  const cacheDir = process.env['ADA_CACHE_DIR'] ?? '.ada-cache';
  const mockMode = process.env['ADA_MOCK'] === '1';

  if (mockMode) {
    config.providers.vision = 'mock-vision';
    config.providers.text = 'mock-text';
    config.providers.tts = 'mock-tts';
  }

  // Single relay sink shared by all providers; the pipeline attaches its
  // composite (file + memory) sink to it at run start.
  const providerSink = createRelayEventSink();

  // For openai-compatible providers (vertex/fal/replicate/openai-compat), the
  // provider factory reads its own env var (ADA_<NAME>_API_KEY). We pass
  // undefined here so the factory's lookup wins.
  const textProviderName = config.providers.text;
  const textKey =
    textProviderName === 'openai'
      ? openaiKey
      : textProviderName === 'claude'
        ? anthropicKey
        : undefined;
  const ttsKey = config.providers.tts.startsWith('openai') ? openaiKey : elevenLabsKey;

  const visionProvider = resolveVisionProvider(config.providers.vision, {
    apiKey: anthropicKey,
    eventSink: providerSink,
  });
  const textProvider = resolveTextProvider(config.providers.text, {
    apiKey: textKey,
    eventSink: providerSink,
  });
  const ttsProvider = resolveTtsProvider(config.providers.tts, {
    apiKey: ttsKey,
    cacheDir,
    eventSink: providerSink,
  });

  const authModule = createAuthModule();
  const redactor = createScreenshotRedactor();

  return {
    deps: {
      planner: createPlanner({ provider: textProvider }),
      navigator: createNavigator({
        provider: visionProvider,
        authModule,
        redactor,
      }),
      scripter: createScripter({ provider: textProvider }),
      voicer: createVoicer({ provider: ttsProvider, cacheDir }),
      composer: createComposer({ resolveTemplate }),
    },
    providerSink,
  };
}
