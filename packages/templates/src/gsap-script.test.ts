import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGsapScript } from './gsap-script.js';
import type { Annotation } from './annotations.js';

function ann(partial: Partial<Annotation> & { id: string; type: Annotation['type'] }): Annotation {
  return {
    x: 100,
    y: 200,
    startSec: 0,
    durationSec: 1.5,
    sceneId: 'home',
    actionIndex: 0,
    ...partial,
  };
}

describe('buildGsapScript', () => {
  it('produces a well-formed empty script tag pair for no annotations', () => {
    const out = buildGsapScript([]);
    assert.match(out, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap/);
    assert.match(out, /window\.__hyperframesGsapTimelines = \{\}/);
    assert.equal((out.match(/<script/g) ?? []).length, 2);
    assert.equal((out.match(/<\/script>/g) ?? []).length, 2);
  });

  it('includes a registered timeline per annotation', () => {
    const out = buildGsapScript([
      ann({ id: 'a1', type: 'arrow' }),
      ann({ id: 'a2', type: 'callout' }),
      ann({ id: 'a3', type: 'zoom-pulse' }),
    ]);
    assert.match(out, /tl_a1/);
    assert.match(out, /tl_a2/);
    assert.match(out, /tl_a3/);
    assert.match(out, /window\.__hyperframesGsapTimelines\["a1"\]/);
  });

  it('includes the HyperFrames seek adapter', () => {
    const out = buildGsapScript([ann({ id: 'a1', type: 'arrow' })]);
    assert.match(out, /window\.__hyperframesGsapAdapter/);
    assert.match(out, /entry\.tl\.seek/);
  });

  it('uses different easing variants per annotation type', () => {
    const arrow = buildGsapScript([ann({ id: 'a1', type: 'arrow' })]);
    const callout = buildGsapScript([ann({ id: 'a2', type: 'callout' })]);
    const pulse = buildGsapScript([ann({ id: 'a3', type: 'zoom-pulse' })]);
    assert.match(arrow, /repeat: 3, yoyo: true/);
    assert.match(callout, /fromTo/);
    assert.match(pulse, /scale: 1\.4/);
  });
});
