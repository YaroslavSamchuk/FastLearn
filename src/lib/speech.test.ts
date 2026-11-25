import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDanishPhrasePauses,
  clampPlaybackSpeed,
  SPEECH_PLAYBACK_SPEEDS
} from './speech.ts';

test('adds commas around a selected phrase without changing its words', () => {
  assert.equal(addDanishPhrasePauses('hyggeligt'), ', hyggeligt ,');
  assert.equal(addDanishPhrasePauses('  Det er hyggeligt.  '), ', Det er hyggeligt ,');
});

test('does not add pauses to empty or punctuation-only selections', () => {
  assert.equal(addDanishPhrasePauses(''), '');
  assert.equal(addDanishPhrasePauses(' , '), '');
});

test('uses the same synthesized speed options for messages and selected phrases', () => {
  assert.deepEqual(SPEECH_PLAYBACK_SPEEDS, [1, 0.7, 0.5]);
  assert.equal(clampPlaybackSpeed(0.7), 0.7);
  assert.equal(clampPlaybackSpeed(0.5), 0.5);
  assert.equal(clampPlaybackSpeed(0.4), 0.5);
  assert.equal(clampPlaybackSpeed(0.8), 0.7);
});
