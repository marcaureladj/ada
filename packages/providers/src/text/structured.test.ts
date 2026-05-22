import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  buildStructuredSystem,
  extractJsonBlock,
  tryParseStructured,
} from './structured.js';

describe('extractJsonBlock', () => {
  it('extracts JSON from a fenced markdown block', () => {
    const raw = 'Voici le résultat :\n```json\n{"a":1}\n```\nFin.';
    assert.equal(extractJsonBlock(raw), '{"a":1}');
  });

  it('extracts JSON from a fence without language tag', () => {
    const raw = '```\n{"b":2}\n```';
    assert.equal(extractJsonBlock(raw), '{"b":2}');
  });

  it('extracts JSON from raw preamble + object', () => {
    const raw = 'Voici: {"c":3} (et plus).';
    assert.equal(extractJsonBlock(raw), '{"c":3}');
  });

  it('extracts JSON array when no object is present', () => {
    const raw = '[1, 2, 3]';
    assert.equal(extractJsonBlock(raw), '[1, 2, 3]');
  });

  it('falls back to trimmed raw if nothing matches', () => {
    const raw = '   not json   ';
    assert.equal(extractJsonBlock(raw), 'not json');
  });
});

describe('buildStructuredSystem', () => {
  it('appends the JSON-only instruction to a user system prompt', () => {
    const out = buildStructuredSystem('You are a planner.');
    assert.match(out, /You are a planner\./);
    assert.match(out, /JSON valide/);
  });

  it('handles undefined user system', () => {
    const out = buildStructuredSystem(undefined);
    assert.match(out, /JSON valide/);
  });
});

describe('tryParseStructured', () => {
  const schema = z.object({ name: z.string(), age: z.number().int() });

  it('returns ok:true for valid JSON matching schema', () => {
    const result = tryParseStructured(schema, '{"name":"alice","age":30}');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.name, 'alice');
      assert.equal(result.data.age, 30);
    }
  });

  it('returns ok:false with feedback on malformed JSON', () => {
    const result = tryParseStructured(schema, '{not valid');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.feedback, /JSON invalide/);
  });

  it('returns ok:false with schema feedback on type mismatch', () => {
    const result = tryParseStructured(schema, '{"name":"bob","age":"thirty"}');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.feedback, /Validation Zod/);
  });

  it('extracts JSON from fenced markdown before parsing', () => {
    const result = tryParseStructured(schema, '```json\n{"name":"carol","age":42}\n```');
    assert.equal(result.ok, true);
  });
});
