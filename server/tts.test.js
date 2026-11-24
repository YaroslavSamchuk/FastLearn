import assert from 'node:assert/strict';
import test from 'node:test';
import { mapSpeedToRate } from './tts.js';

test('maps the three playback choices to matching Edge TTS rates', () => {
  assert.equal(mapSpeedToRate(1), 1);
  assert.equal(mapSpeedToRate(0.8), 0.8);
  assert.equal(mapSpeedToRate(0.6), 0.6);
  assert.equal(mapSpeedToRate(0.4), 0.4);
  assert.equal(mapSpeedToRate(0.3), 0.4);
  assert.equal(mapSpeedToRate(Number.NaN), 1);
});
