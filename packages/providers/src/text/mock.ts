import type { z } from 'zod';
import type { TextCompletionRequest, TextProvider, TextProviderConfig } from './index.js';

// Fixed responses by "intent". The mock detects which schema is being asked
// by inspecting the prompt — good enough for the integration test.
const FALLBACK_TEXT = 'OK.';

function looksLikeScriptRequest(prompt: string): boolean {
  return prompt.includes('Script JSON') || prompt.includes('segments');
}

function looksLikeScenarioRequest(prompt: string): boolean {
  return (
    prompt.includes('ScenarioPlan') || prompt.includes('scenes') || prompt.includes('Scénario')
  );
}

function defaultScenarioPlan(): unknown {
  return {
    generatedAt: new Date().toISOString(),
    language: 'fr',
    scenes: [
      {
        id: 'home',
        objective: 'Mock: explorer la page d\'accueil',
        preconditions: [],
        estimatedDurationSec: 20,
        successCriteria: '/',
      },
      {
        id: 'about',
        objective: 'Mock: visiter la section À propos',
        preconditions: ['home'],
        estimatedDurationSec: 25,
        successCriteria: 'about',
      },
    ],
  };
}

function defaultScript(): unknown {
  return {
    language: 'fr',
    segments: [
      {
        id: 'seg-home-1',
        sceneId: 'home',
        text: 'Bienvenue. Voici la page d\'accueil de notre application.',
        startSec: 0,
        estimatedDurationSec: 4,
      },
      {
        id: 'seg-home-2',
        sceneId: 'home',
        text: 'Descendons pour découvrir les principales fonctionnalités.',
        startSec: 4,
        estimatedDurationSec: 4,
      },
      {
        id: 'seg-about-1',
        sceneId: 'about',
        text: 'Cliquons maintenant sur À propos pour en savoir plus.',
        startSec: 8,
        estimatedDurationSec: 4,
      },
    ],
  };
}

export interface MockTextConfig extends TextProviderConfig {
  scenarioPlan?: unknown;
  script?: unknown;
  fallbackText?: string;
}

export function createMockTextProvider(config: MockTextConfig = {}): TextProvider {
  return {
    name: 'mock-text',
    async complete(request: TextCompletionRequest): Promise<string> {
      return config.fallbackText ?? FALLBACK_TEXT + ` (prompt len ${request.prompt.length})`;
    },
    async completeStructured<T>(
      request: TextCompletionRequest & { schema: z.ZodType<T> },
    ): Promise<T> {
      let candidate: unknown;
      if (looksLikeScriptRequest(request.prompt)) {
        candidate = config.script ?? defaultScript();
      } else if (looksLikeScenarioRequest(request.prompt)) {
        candidate = config.scenarioPlan ?? defaultScenarioPlan();
      } else {
        // Last-ditch attempt: let the schema generate or fail loudly.
        candidate = config.scenarioPlan ?? defaultScenarioPlan();
      }
      return request.schema.parse(candidate);
    },
  };
}
