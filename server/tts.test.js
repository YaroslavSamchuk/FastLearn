import assert from 'node:assert/strict';
import test from 'node:test';
import { mapSpeedToRate } from './tts.js';

test('maps the three playback choices to matching Edge TTS rates', () => {
  assert.equal(mapSpeedToRate(1), 1);
  assert.equal(mapSpeedToRate(0.7), 0.7);
  assert.equal(mapSpeedToRate(0.5), 0.5);
  assert.equal(mapSpeedToRate(0.4), 0.4);
  assert.equal(mapSpeedToRate(0.3), 0.4);
  assert.equal(mapSpeedToRate(Number.NaN), 1);
});
