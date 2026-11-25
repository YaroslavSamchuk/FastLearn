import assert from 'node:assert/strict';
import test from 'node:test';
import { mapSpeedToRate } from './tts.js';
import { DEFAULT_VOICES, isValidVoice, normalizeVoices, resolveVoice } from './ttsConfig.js';
import {
  EDGE_AGENT_PROFILES,
  formatSsmlRate,
  hashSecMsGecV2,
  isAgentInCooldown,
  markAgentCooldown,
  parseEdgeBinaryAudioFrame,
  pickEdgeAgent
} from './ttsProviders.js';

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

test('formats Edge TTS SSML percentage rates cleanly', () => {
  assert.equal(formatSsmlRate(1), '+0%');
  assert.equal(formatSsmlRate(0.7), '-30%');
  assert.equal(formatSsmlRate(0.5), '-50%');
  assert.equal(formatSsmlRate(0.2), '-60%');
});

test('generates Sec-MS-GEC v2 CS64-SHA256 tokens and parses binary audio frames', async () => {
  const token = await hashSecMsGecV2('1337000000000000006A5AA1D4EAFF4E9FB37E23D68491D6F4');
  assert.match(token, /^[0-9A-F]{16}-[0-9A-F]{64}$/);

  const header = new TextEncoder().encode('X-RequestId:req123\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n');
  const payload = new Uint8Array([0xff, 0xf3, 0x44, 0x00]);
  const frame = new Uint8Array(2 + header.length + payload.length);
  new DataView(frame.buffer).setUint16(0, header.length, false);
  frame.set(header, 2);
  frame.set(payload, 2 + header.length);

  const parsed = parseEdgeBinaryAudioFrame(frame.buffer);
  assert.ok(parsed);
  assert.equal(parsed.requestId, 'req123');
  assert.deepEqual(Array.from(parsed.audio), [0xff, 0xf3, 0x44, 0x00]);
});

test('rotates across Edge agent profiles and skips cooled-down agents', () => {
  assert.ok(EDGE_AGENT_PROFILES.length >= 4);
  const first = pickEdgeAgent('test-endpoint');
  const second = pickEdgeAgent('test-endpoint');
  assert.notEqual(first.id, second.id);

  markAgentCooldown('test-endpoint', first.id, 30_000);
  assert.equal(isAgentInCooldown('test-endpoint', first.id), true);

  for (let i = 0; i < EDGE_AGENT_PROFILES.length; i += 1) {
    assert.notEqual(pickEdgeAgent('test-endpoint').id, first.id);
  }
});
