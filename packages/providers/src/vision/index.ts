import type { AgentAction } from '@ada/core';

export interface ComputerActionContext {
  screenshotAfter: Buffer;
  url: string;
}

export interface VisionRunInput {
  initialScreenshot: Buffer;
  url: string;
  goal: string;
  viewportWidth: number;
  viewportHeight: number;
  maxIterations: number;
  executeAction: (action: AgentAction) => Promise<ComputerActionContext>;
  onStep?: (
    action: AgentAction,
    screenshotBefore: Buffer,
    screenshotAfter: Buffer,
  ) => void;
}

export interface VisionRunResult {
  actions: AgentAction[];
  success: boolean;
  reasoning: string;
  error?: string;
}

export interface VisionProvider {
  readonly name: string;
  runComputerLoop(input: VisionRunInput): Promise<VisionRunResult>;
}

export type VisionProviderFactory = (config: VisionProviderConfig) => VisionProvider;

export interface VisionProviderConfig {
  apiKey?: string | undefined;
  model?: string | undefined;
  maxRetries?: number | undefined;
  betaHeader?: string | undefined;
}
