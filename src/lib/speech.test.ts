import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySpeechPlaybackRate,
  addDanishPhrasePauses,
  clampPlaybackSpeed,
  PHRASE_PLAYBACK_SPEEDS
} from './speech.ts';

test('adds commas around a selected phrase without changing its words', () => {
  assert.equal(addDanishPhrasePauses('hyggeligt'), ', hyggeligt ,');
  assert.equal(addDanishPhrasePauses('  Det er hyggeligt.  '), ', Det er hyggeligt ,');
});

test('does not add pauses to empty or punctuation-only selections', () => {
  assert.equal(addDanishPhrasePauses(''), '');
  assert.equal(addDanishPhrasePauses(' , '), '');
});

test('preserves the phrase playback choices without changing standard chat speeds', () => {
  assert.deepEqual(PHRASE_PLAYBACK_SPEEDS, [1, 0.7, 0.4]);
  assert.equal(clampPlaybackSpeed(0.7, true), 0.7);
  assert.equal(clampPlaybackSpeed(0.4, true), 0.4);
  assert.equal(clampPlaybackSpeed(0.7), 0.8);
  assert.equal(clampPlaybackSpeed(0.4), 0.6);
});

test('applies each supported speech rate to the media element without changing pitch', () => {
  const audio = { playbackRate: 1, defaultPlaybackRate: 1, preservesPitch: false };

  for (const speed of [1, 0.8, 0.6, 0.7, 0.4]) {
    applySpeechPlaybackRate(audio, speed);
    assert.equal(audio.playbackRate, speed);
    assert.equal(audio.defaultPlaybackRate, speed);
    assert.equal(audio.preservesPitch, true);
  }
});
