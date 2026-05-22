import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runScreenshotJsonLoop } from './screenshot-json.js';
import type { AgentAction } from '@ada/core';
import type { VisionRunInput, ComputerActionContext } from './index.js';

const SCREENSHOT = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic

function makeInput(actions: AgentAction[] = [], maxIterations = 10): VisionRunInput {
  const executedActions: AgentAction[] = [];
  return {
    initialScreenshot: SCREENSHOT,
    url: 'https://example.com',
    goal: 'click signup and type email',
    viewportWidth: 1280,
    viewportHeight: 800,
    maxIterations,
    executeAction: async (action: AgentAction): Promise<ComputerActionContext> => {
      executedActions.push(action);
      actions.push(action);
      return { screenshotAfter: SCREENSHOT, url: 'https://example.com/next' };
    },
  };
}

function jsonReply(action: Record<string, unknown>): string {
  return JSON.stringify(action);
}

describe('runScreenshotJsonLoop', () => {
  it('executes a sequence of actions then stops on done', async () => {
    const replies = [
      jsonReply({
        type: 'left_click',
        selector: '#login',
        reasoning: 'click the login button',
      }),
      jsonReply({
        type: 'type',
        selector: 'input[name=email]',
        text: 'alice@test.com',
        reasoning: 'enter the email',
      }),
      jsonReply({ type: 'done', reasoning: 'logged in' }),
    ];
    let callIdx = 0;
    const input = makeInput([]);
    const result = await runScreenshotJsonLoop(
      input,
      {
        name: 'mock-vision',
        async callVision() {
          const reply = replies[Math.min(callIdx, replies.length - 1)]!;
          callIdx += 1;
          return { rawText: reply };
        },
      },
      {},
    );
    assert.equal(result.success, true);
    assert.equal(result.actions.length, 2, `expected 2 actions, got ${result.actions.length}`);
    assert.equal(result.actions[0]!.type, 'left_click');
    assert.equal(result.actions[0]!.selector, '#login');
    assert.equal(result.actions[1]!.type, 'type');
    assert.equal(result.actions[1]!.text, 'alice@test.com');
  });

  it('returns success=false when maxIterations is reached without done', async () => {
    const input = makeInput([], 3);
    const result = await runScreenshotJsonLoop(
      input,
      {
        name: 'mock-vision',
        async callVision() {
          return {
            rawText: jsonReply({
              type: 'left_click',
              coordinate: [100, 100],
              reasoning: 'click somewhere',
            }),
          };
        },
      },
      {},
    );
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /maxIterations/);
    assert.equal(result.actions.length, 3);
  });

  it('returns success=false when LLM returns malformed JSON repeatedly', async () => {
    const input = makeInput();
    const result = await runScreenshotJsonLoop(
      input,
      {
        name: 'mock-vision',
        async callVision() {
          return { rawText: 'totally not json at all' };
        },
      },
      { maxRetries: 1 },
    );
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /parse failed/);
  });

  it('extracts JSON from fenced markdown response', async () => {
    let calledOnce = false;
    const input = makeInput();
    const result = await runScreenshotJsonLoop(
      input,
      {
        name: 'mock-vision',
        async callVision() {
          if (calledOnce) {
            return { rawText: jsonReply({ type: 'done', reasoning: 'ok' }) };
          }
          calledOnce = true;
          return {
            rawText:
              '```json\n{"type":"scroll","scrollDirection":"down","reasoning":"scroll down"}\n```',
          };
        },
      },
      {},
    );
    assert.equal(result.success, true);
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0]!.type, 'scroll');
    assert.equal(result.actions[0]!.scrollDirection, 'down');
  });
});
