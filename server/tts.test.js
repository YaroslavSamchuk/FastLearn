import assert from 'node:assert/strict';
import test from 'node:test';
import { mapSpeedToRate } from './tts.js';
import { DEFAULT_VOICES, isValidVoice, normalizeVoices, resolveVoice } from './ttsConfig.js';

test('maps the three playback choices to matching Edge TTS rates', () => {
  assert.equal(mapSpeedToRate(1), 1);
  assert.equal(mapSpeedToRate(0.7), 0.7);
  assert.equal(mapSpeedToRate(0.5), 0.5);
  assert.equal(mapSpeedToRate(0.4), 0.4);
  assert.equal(mapSpeedToRate(0.3), 0.4);
  assert.equal(mapSpeedToRate(Number.NaN), 1);
});

test('validates and normalizes TTS voices per language', () => {
  assert.equal(isValidVoice('da', 'da-DK-ChristelNeural'), true);
  assert.equal(isValidVoice('da', 'en-US-JennyNeural'), false);
  assert.equal(isValidVoice('en', 'en-GB-RyanNeural'), true);
  assert.equal(resolveVoice('da', 'invalid'), DEFAULT_VOICES.da);
  assert.deepEqual(normalizeVoices({ da: 'da-DK-ChristelNeural', en: 'unknown' }), {
    da: 'da-DK-ChristelNeural',
    en: DEFAULT_VOICES.en
  });
});
