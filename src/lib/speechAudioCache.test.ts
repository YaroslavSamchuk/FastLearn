import assert from 'node:assert/strict';
import test from 'node:test';
import { getPrefetchedSpeechAudio, loadSpeechAudio } from './speechAudioCache.ts';

test('loads all phrase speeds concurrently and keeps each audio variant separate', async () => {
  const phrase = `parallel phrase ${Date.now()}`;
  const speeds = [1, 0.7, 0.4];
  const calls = new Map<number, number>();

  const audios = await Promise.all(
    speeds.map((speed) =>
      loadSpeechAudio('da', phrase, speed, async () => {
        calls.set(speed, (calls.get(speed) ?? 0) + 1);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Blob([String(speed)]);
      })
    )
  );

  assert.deepEqual([...calls.keys()], speeds);
  assert.deepEqual([...calls.values()], [1, 1, 1]);
  assert.deepEqual(
    await Promise.all(audios.map((audio) => audio.text())),
    ['1', '0.7', '0.4']
  );
  assert.equal(getPrefetchedSpeechAudio('da', phrase, 1), audios[0]);
  assert.equal(getPrefetchedSpeechAudio('da', phrase, 0.7), audios[1]);
  assert.equal(getPrefetchedSpeechAudio('da', phrase, 0.4), audios[2]);
});
