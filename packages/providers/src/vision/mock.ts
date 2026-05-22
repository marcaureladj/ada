import type { AgentAction } from '@ada/core';
import type {
  VisionProvider,
  VisionProviderConfig,
  VisionRunInput,
  VisionRunResult,
} from './index.js';

// Default scripted sequence: scroll once then declare done. Just enough to
// exercise the loop, the executeAction callback, and the trace assembly.
const DEFAULT_SEQUENCE: Omit<AgentAction, 'timestamp'>[] = [
  {
    type: 'scroll',
    scrollDirection: 'down',
    scrollAmount: 3,
    reasoning: 'mock: scroll to reveal content',
  },
  {
    type: 'left_click',
    coordinate: [640, 400],
    reasoning: 'mock: click center of viewport',
  },
  {
    type: 'done',
    reasoning: 'mock: objective reached',
  },
];

export interface MockVisionConfig extends VisionProviderConfig {
  /** Override the scripted sequence (defaults to scroll → click → done). */
  sequence?: Omit<AgentAction, 'timestamp'>[];
}

export function createMockVisionProvider(config: MockVisionConfig = {}): VisionProvider {
  const sequence = config.sequence ?? DEFAULT_SEQUENCE;

  return {
    name: 'mock-vision',
    async runComputerLoop(input: VisionRunInput): Promise<VisionRunResult> {
      const actions: AgentAction[] = [];

      for (const template of sequence) {
        if (template.type === 'done') {
          return {
            actions,
            success: true,
            reasoning: template.reasoning,
          };
        }
        const action: AgentAction = {
          ...template,
          timestamp: new Date().toISOString(),
        };
        const before = input.initialScreenshot; // same buffer reused; mocks don't care
        try {
          const result = await input.executeAction(action);
          input.onStep?.(action, before, result.screenshotAfter);
        } catch (err) {
          return {
            actions,
            success: false,
            reasoning: template.reasoning,
            error: `mock executeAction failed: ${(err as Error).message}`,
          };
        }
        actions.push(action);
      }

      return {
        actions,
        success: true,
        reasoning: 'mock: sequence ended',
      };
    },
  };
}
