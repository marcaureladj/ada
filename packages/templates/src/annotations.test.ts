import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAnnotations } from './annotations.js';
import type { NavigationTrace, Script, AgentAction } from '@ada/core';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

function makeAction(partial: Partial<AgentAction> & { type: AgentAction['type'] }): AgentAction {
  return {
    reasoning: partial.reasoning ?? 'test',
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

function makeScript(sceneId: string, segments: number): Script {
  return {
    language: 'fr',
    segments: Array.from({ length: segments }, (_, i) => ({
      id: `seg-${sceneId}-${i}`,
      sceneId,
      text: `segment ${i}`,
      startSec: i * 3,
      estimatedDurationSec: 3,
    })),
  };
}

function trace(actions: AgentAction[], sceneId = 'home'): NavigationTrace {
  return {
    sceneId,
    actions,
    capturePath: '',
    durationSec: 10,
    success: true,
  };
}

describe('extractAnnotations', () => {
  it('produces one arrow annotation per click', () => {
    const t = trace([
      makeAction({ type: 'left_click', coordinate: [400, 300] }),
    ]);
    const result = extractAnnotations({
      traces: [t],
      script: makeScript('home', 2),
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.type, 'arrow');
    assert.equal(result[0]!.x, 400);
    assert.equal(result[0]!.y, 300);
  });

  it('produces a callout with label for type actions', () => {
    const t = trace([makeAction({ type: 'type', text: 'hello world', coordinate: [100, 200] })]);
    const result = extractAnnotations({
      traces: [t],
      script: makeScript('home', 1),
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.type, 'callout');
    assert.equal(result[0]!.label, 'hello world');
  });

  it('produces two annotations for drag (arrow start + pulse end)', () => {
    const t = trace([
      makeAction({
        type: 'left_click_drag',
        coordinate: [100, 100],
        coordinateEnd: [500, 400],
      }),
    ]);
    const result = extractAnnotations({
      traces: [t],
      script: makeScript('home', 1),
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    assert.equal(result.length, 2);
    assert.equal(result[0]!.type, 'arrow');
    assert.equal(result[0]!.x, 100);
    assert.equal(result[1]!.type, 'zoom-pulse');
    assert.equal(result[1]!.x, 500);
    assert.equal(result[1]!.y, 400);
  });

  it('emits zero annotations for boring action types', () => {
    const t = trace([
      makeAction({ type: 'scroll', scrollDirection: 'down', scrollAmount: 3 }),
      makeAction({ type: 'wait', duration: 1 }),
      makeAction({ type: 'mouse_move', coordinate: [10, 10] }),
      makeAction({ type: 'done' }),
    ]);
    const result = extractAnnotations({
      traces: [t],
      script: makeScript('home', 1),
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    assert.equal(result.length, 0);
  });

  it('skips failed traces entirely', () => {
    const t: NavigationTrace = {
      sceneId: 'home',
      actions: [makeAction({ type: 'left_click', coordinate: [10, 10] })],
      capturePath: '',
      durationSec: 5,
      success: false,
      error: 'mock failure',
    };
    const result = extractAnnotations({
      traces: [t],
      script: makeScript('home', 1),
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    assert.equal(result.length, 0);
  });

  it('starts annotation BEFORE the click (lead time applied)', () => {
    // Two clicks in a 6s scene → slots at 1.5s and 4.5s mid-points, with 0.2s lead.
    const t = trace([
      makeAction({ type: 'left_click', coordinate: [100, 100] }),
      makeAction({ type: 'left_click', coordinate: [200, 200] }),
    ]);
    const result = extractAnnotations({
      traces: [t],
      script: makeScript('home', 2),
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    assert.equal(result.length, 2);
    assert.ok(result[0]!.startSec < 1.5, `first start ${result[0]!.startSec} should precede 1.5`);
    assert.ok(result[1]!.startSec < 4.5, `second start ${result[1]!.startSec} should precede 4.5`);
  });

  it('clamps coordinates to viewport bounds', () => {
    const t = trace([makeAction({ type: 'left_click', coordinate: [9999, -50] })]);
    const result = extractAnnotations({
      traces: [t],
      script: makeScript('home', 1),
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.x, VIEWPORT_WIDTH);
    assert.equal(result[0]!.y, 0);
  });
});
