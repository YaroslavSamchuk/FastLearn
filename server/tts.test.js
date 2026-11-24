import assert from 'node:assert/strict';
import test from 'node:test';
import { mapSpeedToRate } from './tts.js';

test('maps the three playback choices to matching Edge TTS rates', () => {
  assert.equal(mapSpeedToRate(1), '+0%');
  assert.equal(mapSpeedToRate(0.8), '-20%');
  assert.equal(mapSpeedToRate(0.6), '-40%');
  assert.equal(mapSpeedToRate(Number.NaN), '+0%');
});
