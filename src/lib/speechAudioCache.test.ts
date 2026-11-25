import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPrefetchedSpeechAudio,
  loadSpeechAudioVariants
} from './speechAudioCache.ts';

test('preloads an independently synthesized audio file for each phrase speed', async () => {
  const phrase = `preloaded phrase ${Date.now()}`;
  const speeds = [1, 0.7, 0.5];
  const requestedSpeeds: number[] = [];

  const audios = await loadSpeechAudioVariants('da', phrase, speeds, async (speed) => {
    requestedSpeeds.push(speed);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Blob([`audio at ${speed}x`]);
  });

  assert.deepEqual(requestedSpeeds.sort((a, b) => b - a), speeds);
  assert.deepEqual(
    await Promise.all(speeds.map((speed) => getPrefetchedSpeechAudio('da', phrase, speed)?.text())),
    speeds.map((speed) => `audio at ${speed}x`)
  );
  assert.deepEqual(await Promise.all(audios.map((audio) => audio.text())), speeds.map((speed) => `audio at ${speed}x`));
});
