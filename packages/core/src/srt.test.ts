import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scriptToSrt, scriptToVtt, scriptToTranscriptMarkdown } from './srt.js';
import type { Script } from './types.js';

const sample: Script = {
  language: 'fr',
  segments: [
    { id: 's1', sceneId: 'home', text: 'Bonjour.', startSec: 0, estimatedDurationSec: 1.5 },
    { id: 's2', sceneId: 'home', text: 'Continuons.', startSec: 1.5, estimatedDurationSec: 2 },
  ],
};

describe('scriptToSrt', () => {
  it('emits numbered cues with HH:MM:SS,mmm timestamps', () => {
    const srt = scriptToSrt(sample);
    assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nBonjour\./);
    assert.match(srt, /2\n00:00:01,500 --> 00:00:03,500\nContinuons\./);
  });

  it('handles single-segment scripts', () => {
    const srt = scriptToSrt({ language: 'en', segments: [sample.segments[0]!] });
    assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500/);
  });
});

describe('scriptToVtt', () => {
  it('starts with WEBVTT and uses HH:MM:SS.mmm separator', () => {
    const vtt = scriptToVtt(sample);
    assert.match(vtt, /^WEBVTT\n\n/);
    assert.match(vtt, /00:00:00\.000 --> 00:00:01\.500\nBonjour\./);
  });
});

describe('scriptToTranscriptMarkdown', () => {
  it('emits a heading with the title and language', () => {
    const md = scriptToTranscriptMarkdown(sample, 'My App');
    assert.match(md, /^# My App/);
    assert.match(md, /_Langue : fr_/);
    assert.match(md, /\*\*\[00:00:00\.000\]\*\* Bonjour\./);
  });
});
