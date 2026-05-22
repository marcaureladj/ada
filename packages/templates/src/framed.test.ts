import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { framedTemplate } from './framed.js';
import { socialTemplate } from './social.js';
import type { TemplateRenderInput } from './types.js';

function sampleInput(overrides: Partial<TemplateRenderInput> = {}): TemplateRenderInput {
  return {
    compositionId: 'demo-test',
    script: {
      language: 'fr',
      segments: [
        {
          id: 'seg-home-1',
          sceneId: 'home',
          text: 'Bienvenue.',
          startSec: 0,
          estimatedDurationSec: 3,
        },
        {
          id: 'seg-home-2',
          sceneId: 'home',
          text: 'Allons plus loin.',
          startSec: 3,
          estimatedDurationSec: 3,
        },
      ],
    },
    audio: [
      {
        id: 'audio-seg-home-1',
        segmentId: 'seg-home-1',
        path: './assets/seg-home-1.mp3',
        durationSec: 3,
        voice: 'mock-voice',
        provider: 'mock-tts',
      },
    ],
    traces: [
      {
        sceneId: 'home',
        actions: [
          {
            type: 'left_click',
            coordinate: [640, 400],
            reasoning: 'click center',
            timestamp: '2026-01-01T00:00:00Z',
          },
          {
            type: 'type',
            text: 'hello',
            coordinate: [200, 100],
            reasoning: 'type into input',
            timestamp: '2026-01-01T00:00:01Z',
          },
        ],
        capturePath: './assets/capture.webm',
        durationSec: 6,
        success: true,
      },
    ],
    ratio: '16:9',
    width: 1920,
    height: 1080,
    ...overrides,
  };
}

describe('framedTemplate.render', () => {
  it('includes data-composition-id and the chrome+screen scaffolding', () => {
    const { html } = framedTemplate.render(sampleInput());
    assert.match(html, /data-composition-id="demo-test"/);
    assert.match(html, /class="browser-chrome"/);
    assert.match(html, /class="screen-wrap"/);
  });

  it('emits an annotation div per visually-interesting action', () => {
    const { html } = framedTemplate.render(sampleInput());
    // 1 click → arrow, 1 type → callout
    const annotationMatches = html.match(/class="annotation\s+(arrow|callout|zoom-pulse)"/g) ?? [];
    assert.equal(annotationMatches.length, 2);
  });

  it('inlines a GSAP CDN script tag', () => {
    const { html } = framedTemplate.render(sampleInput());
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gsap/);
  });

  it('escapes HTML in caption text (no XSS)', () => {
    const malicious = '<script>alert(1)</script>';
    const input = sampleInput();
    input.script.segments[0]!.text = malicious;
    const { html } = framedTemplate.render(input);
    assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag leaked');
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it('escapes the type-action text inside callout labels', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const input = sampleInput();
    input.traces[0]!.actions[1]!.text = malicious;
    const { html } = framedTemplate.render(input);
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'raw img tag leaked');
    assert.match(html, /&lt;img/);
  });
});

describe('socialTemplate.render', () => {
  it('forces a 9:16 stage regardless of input width/height', () => {
    const { html } = socialTemplate.render(sampleInput({ width: 1920, height: 1080 }));
    assert.match(html, /data-width="1080"/);
    assert.match(html, /data-height="1920"/);
  });

  it('converts all annotations to zoom-pulses', () => {
    const { html } = socialTemplate.render(sampleInput());
    const arrows = html.match(/class="annotation arrow/g) ?? [];
    const pulses = html.match(/class="annotation zoom-pulse/g) ?? [];
    assert.equal(arrows.length, 0);
    assert.ok(pulses.length >= 1);
  });
});
