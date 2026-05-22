import { NotImplementedError } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

export function createQwenVisionProvider(config: VisionProviderConfig): VisionProvider {
  return {
    name: 'qwen2-vl-local',
    async runComputerLoop(_input: VisionRunInput): Promise<VisionRunResult> {
      void config;
      throw new NotImplementedError('VisionProvider:qwen2-vl-local');
    },
  };
}
