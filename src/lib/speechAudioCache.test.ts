import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPrefetchedSpeechAudio,
  loadSpeechAudio,
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

test('reports each speed as ready immediately and deduplicates concurrent callers for the same speed', async () => {
  const phrase = `deduped phrase ${Date.now()}`;
  const readyOrder: number[] = [];
  const callsBySpeed = new Map<number, number>();

  const loadForSpeed = (speed: number) => async () => {
    callsBySpeed.set(speed, (callsBySpeed.get(speed) ?? 0) + 1);
    const delay = speed === 1 ? 5 : speed === 0.7 ? 15 : 30;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return new Blob([`audio at ${speed}x`]);
  };

  const [autoplayBlob, variants] = await Promise.all([
    loadSpeechAudio('da', phrase, 1, loadForSpeed(1)),
    loadSpeechAudioVariants('da', phrase, [1, 0.7, 0.5], (speed) => loadForSpeed(speed)(), {
      onSpeedReady: (speed) => readyOrder.push(speed)
    })
  ]);

  assert.equal(callsBySpeed.get(1), 1);
  assert.equal(callsBySpeed.get(0.7), 1);
  assert.equal(callsBySpeed.get(0.5), 1);
  assert.deepEqual(readyOrder, [1, 0.7, 0.5]);
  assert.equal(autoplayBlob, variants[0]);
});
