import { NotImplementedError } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

export function createGpt4VisionProvider(config: VisionProviderConfig): VisionProvider {
  return {
    name: 'gpt-4-vision',
    async runComputerLoop(_input: VisionRunInput): Promise<VisionRunResult> {
      void config;
      throw new NotImplementedError('VisionProvider:gpt-4-vision');
    },
  };
}
