import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_SELECTION_WORDS,
  clampSelectionRange,
  normalizeAssistantText
} from './textTokens.ts';

test('removes whitespace before punctuation in a new assistant response', () => {
  assert.equal(
    normalizeAssistantText('Tak\n, det vil jeg huske.'),
    'Tak, det vil jeg huske.'
  );
});

test('preserves intentional paragraph breaks', () => {
  assert.equal(
    normalizeAssistantText('Første sætning.\n\nAnden sætning.'),
    'Første sætning.\n\nAnden sætning.'
  );
});

test('clamps word drag selection to at most 20 words in either direction', () => {
  assert.equal(MAX_SELECTION_WORDS, 20);
  assert.deepEqual(clampSelectionRange(5, 35), { start: 5, end: 24 });
  assert.deepEqual(clampSelectionRange(30, 0), { start: 30, end: 11 });
  assert.deepEqual(clampSelectionRange(4, 10), { start: 4, end: 10 });
});
