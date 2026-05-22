import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentActionSchema,
  runConfigSchema,
  scenarioPlanSchema,
  scriptSchema,
} from './schema.js';

describe('runConfigSchema', () => {
  it('accepts a minimal config with sensible defaults', () => {
    const result = runConfigSchema.safeParse({
      project: { name: 'demo', url: 'https://example.com', language: 'fr' },
      output: { path: './demo.mp4' },
      providers: {},
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.output.format, 'mp4');
      assert.equal(result.data.output.resolution, '1080p');
      assert.equal(result.data.providers.vision, 'claude-computer-use');
    }
  });

  it('rejects an invalid URL', () => {
    const result = runConfigSchema.safeParse({
      project: { name: 'demo', url: 'not-a-url', language: 'fr' },
      output: { path: './demo.mp4' },
      providers: {},
    });
    assert.equal(result.success, false);
  });

  it('rejects an unknown language', () => {
    const result = runConfigSchema.safeParse({
      project: { name: 'demo', url: 'https://x.com', language: 'es' },
      output: { path: './demo.mp4' },
      providers: {},
    });
    assert.equal(result.success, false);
  });
});

describe('agentActionSchema', () => {
  const validTypes = [
    'left_click',
    'right_click',
    'middle_click',
    'double_click',
    'triple_click',
    'type',
    'key',
    'mouse_move',
    'left_click_drag',
    'scroll',
    'wait',
    'screenshot',
    'cursor_position',
    'done',
  ] as const;

  for (const type of validTypes) {
    it(`accepts action type "${type}"`, () => {
      const result = agentActionSchema.safeParse({
        type,
        reasoning: 'test',
        timestamp: new Date().toISOString(),
      });
      assert.equal(result.success, true);
    });
  }

  it('rejects unknown action types', () => {
    const result = agentActionSchema.safeParse({
      type: 'navigate',
      reasoning: 'test',
      timestamp: new Date().toISOString(),
    });
    assert.equal(result.success, false);
  });

  it('accepts coordinate tuples', () => {
    const result = agentActionSchema.safeParse({
      type: 'left_click',
      coordinate: [100, 200],
      reasoning: 'click',
      timestamp: new Date().toISOString(),
    });
    assert.equal(result.success, true);
  });
});

describe('scenarioPlanSchema', () => {
  it('requires at least one scene', () => {
    const result = scenarioPlanSchema.safeParse({
      generatedAt: new Date().toISOString(),
      language: 'fr',
      scenes: [],
    });
    assert.equal(result.success, false);
  });
});

describe('scriptSchema', () => {
  it('accepts a script with multiple segments', () => {
    const result = scriptSchema.safeParse({
      language: 'fr',
      segments: [
        {
          id: 's1',
          sceneId: 'home',
          text: 'hello',
          startSec: 0,
          estimatedDurationSec: 2,
        },
      ],
    });
    assert.equal(result.success, true);
  });
});
