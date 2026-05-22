import { NotImplementedError } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

export function createGeminiVisionProvider(config: VisionProviderConfig): VisionProvider {
  return {
    name: 'gemini-vision',
    async runComputerLoop(_input: VisionRunInput): Promise<VisionRunResult> {
      void config;
      throw new NotImplementedError('VisionProvider:gemini-vision');
    },
  };
}
