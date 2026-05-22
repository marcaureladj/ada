import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateKey } from './key-translate.js';

describe('translateKey', () => {
  const cases: [string, string][] = [
    ['Return', 'Enter'],
    ['KP_Enter', 'Enter'],
    ['Tab', 'Tab'],
    ['BackSpace', 'Backspace'],
    ['Page_Down', 'PageDown'],
    ['Page_Up', 'PageUp'],
    ['Up', 'ArrowUp'],
    ['ctrl+a', 'Control+A'],
    ['ctrl+shift+T', 'Control+Shift+T'],
    ['shift+Tab', 'Shift+Tab'],
    ['Super_L', 'Meta'],
    ['cmd+c', 'Meta+C'],
    ['F5', 'F5'],
    ['Escape', 'Escape'],
  ];

  for (const [input, expected] of cases) {
    it(`translates "${input}" to "${expected}"`, () => {
      assert.equal(translateKey(input), expected);
    });
  }

  it('passes unknown single-key names through unchanged', () => {
    assert.equal(translateKey('Insert'), 'Insert');
  });
});
