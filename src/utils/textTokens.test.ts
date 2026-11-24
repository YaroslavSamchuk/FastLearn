import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAssistantText } from './textTokens.ts';

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
