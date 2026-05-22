import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CostAccumulator, estimateCostUsd } from './cost.js';

describe('estimateCostUsd', () => {
  it('returns 0 for empty delta', () => {
    assert.equal(estimateCostUsd({}), 0);
  });

  it('charges for text input/output tokens', () => {
    // Sonnet pricing: 3 USD/M in, 15 USD/M out
    const cost = estimateCostUsd({
      textInputTokens: 1_000_000,
      textOutputTokens: 1_000_000,
    });
    assert.equal(cost, 18);
  });

  it('charges for TTS characters', () => {
    // ElevenLabs ~0.18 USD per 1k chars
    const cost = estimateCostUsd({ ttsCharacters: 10_000 });
    assert.ok(cost > 1.7 && cost < 1.9, `got ${cost}`);
  });

  it('rounds to 4 decimal places', () => {
    const cost = estimateCostUsd({ textInputTokens: 7 });
    // 7 tokens * $3/1M ≈ $0.000021 → rounded to $0.0000
    assert.equal(cost.toString().split('.')[1]?.length ?? 0 <= 4, true);
  });
});

describe('CostAccumulator', () => {
  it('cumule plusieurs deltas', () => {
    const acc = new CostAccumulator();
    acc.add({ textInputTokens: 500, textOutputTokens: 100 });
    acc.add({ ttsCharacters: 2000 });
    const snap = acc.snapshot();
    assert.equal(snap.textInputTokens, 500);
    assert.equal(snap.textOutputTokens, 100);
    assert.equal(snap.ttsCharacters, 2000);
    assert.ok(snap.estimatedCostUsd > 0);
  });

  it('part de zéro pour chaque champ', () => {
    const snap = new CostAccumulator().snapshot();
    assert.equal(snap.textInputTokens, 0);
    assert.equal(snap.estimatedCostUsd, 0);
  });

  it('OpenAI text est moins cher que Claude à volume égal', () => {
    const claude = estimateCostUsd({
      textProvider: 'claude',
      textInputTokens: 1_000_000,
      textOutputTokens: 1_000_000,
    });
    const openai = estimateCostUsd({
      textProvider: 'openai',
      textInputTokens: 1_000_000,
      textOutputTokens: 1_000_000,
    });
    assert.ok(openai < claude, `expected openai (${openai}) < claude (${claude})`);
  });

  it('OpenAI TTS est nettement moins cher que ElevenLabs', () => {
    const eleven = estimateCostUsd({ ttsProvider: 'elevenlabs', ttsCharacters: 10_000 });
    const openai = estimateCostUsd({ ttsProvider: 'openai', ttsCharacters: 10_000 });
    assert.ok(openai < eleven, `expected openai (${openai}) < elevenlabs (${eleven})`);
  });

  it('CostAccumulator.setProviders influence le snapshot', () => {
    const acc = new CostAccumulator();
    acc.setProviders('openai', 'openai');
    acc.add({ textInputTokens: 1_000_000, textOutputTokens: 1_000_000 });
    const snap = acc.snapshot();
    assert.equal(snap.textProvider, 'openai');
    assert.equal(snap.ttsProvider, 'openai');
    // 2.5 + 10 = $12.5 for the openai pair, vs $18 for claude.
    assert.ok(snap.estimatedCostUsd < 15);
  });
});
