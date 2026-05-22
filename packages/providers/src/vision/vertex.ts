import { NotImplementedError } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

// Gemini via Vertex AI. Real implementation needs a different agent loop
// than Computer Use (no native browser-actions tool) — deferred to session
// 10. The OpenAI-compatible chat endpoint Vertex now exposes does not
// include a Computer Use equivalent.
export function createVertexVisionProvider(config: VisionProviderConfig): VisionProvider {
  return {
    name: 'vertex-vision',
    async runComputerLoop(_input: VisionRunInput): Promise<VisionRunResult> {
      void config;
      throw new NotImplementedError(
        'VisionProvider:vertex-vision — Computer Use n\'est pas disponible côté Vertex. Utilisez claude-computer-use.',
      );
    },
  };
}
