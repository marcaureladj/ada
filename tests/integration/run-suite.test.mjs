// Unit tests for the integration suite helpers (no real ada calls).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, tryParseJson, APPS } from './run-suite.mjs';

describe('parseArgs', () => {
  it('defaults to plan-only mode and 2000ms delay', () => {
    const out = parseArgs(['node', 'script']);
    assert.equal(out.mode, 'plan-only');
    assert.equal(out.delayMs, 2000);
  });

  it('reads --mode and --delay', () => {
    const out = parseArgs(['node', 'script', '--mode=mock', '--delay=500']);
    assert.equal(out.mode, 'mock');
    assert.equal(out.delayMs, 500);
  });

  it('flags --help', () => {
    const out = parseArgs(['node', 'script', '--help']);
    assert.equal(out.help, true);
  });
});

describe('tryParseJson', () => {
  it('extracts JSON from a clean payload', () => {
    assert.deepEqual(tryParseJson('{"a":1}'), { a: 1 });
  });

  it('extracts JSON when wrapped in surrounding noise', () => {
    assert.deepEqual(tryParseJson('Plan généré.\n{"scenes":[]}'), { scenes: [] });
  });

  it('returns null on malformed JSON', () => {
    assert.equal(tryParseJson('not json'), null);
    assert.equal(tryParseJson(''), null);
  });
});

describe('APPS', () => {
  it('contains the 5 expected apps from CDC §6.2', () => {
    assert.deepEqual(APPS, ['calcom', 'plane', 'documenso', 'twenty', 'formbricks']);
  });
});
