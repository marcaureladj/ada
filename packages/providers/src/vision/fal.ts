import { NotImplementedError } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

export function createFalVisionProvider(config: VisionProviderConfig): VisionProvider {
  return {
    name: 'fal-vision',
    async runComputerLoop(_input: VisionRunInput): Promise<VisionRunResult> {
      void config;
      throw new NotImplementedError(
        'VisionProvider:fal-vision — Computer Use n\'est pas disponible côté Fal. Utilisez claude-computer-use.',
      );
    },
  };
}
