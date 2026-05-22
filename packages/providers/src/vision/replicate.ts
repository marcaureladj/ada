import { NotImplementedError } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

export function createReplicateVisionProvider(config: VisionProviderConfig): VisionProvider {
  return {
    name: 'replicate-vision',
    async runComputerLoop(_input: VisionRunInput): Promise<VisionRunResult> {
      void config;
      throw new NotImplementedError(
        'VisionProvider:replicate-vision — Computer Use n\'est pas disponible côté Replicate. Utilisez claude-computer-use.',
      );
    },
  };
}
