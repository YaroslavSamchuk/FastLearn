// language: TypeScript, file: src/lib/speech.ts, target: Web
import { normalizeSpeedValue } from '../../server/ttsConfig.js';

const CODE_FENCE = /```[\s\S]*?```/g;
const MARKUP = /[*_`#~]+/g;
const PICTOGRAPHS = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;

export const SPEECH_PLAYBACK_SPEEDS = [1, 0.7, 0.5] as const;
export const PHRASE_PLAYBACK_SPEEDS = SPEECH_PLAYBACK_SPEEDS;

/**
 * Strips formatting that would otherwise be read aloud as characters:
 * asterisks, backticks, code fences and emoji.
 */
export function toSpeechText(input: string): string {
  return input
    .replace(CODE_FENCE, ' ')
    .replace(MARKUP, '')
    .replace(PICTOGRAPHS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function addDanishPhrasePauses(input: string): string {
  const phrase = input.trim().replace(/^[,.;:!?…\s]+|[,.;:!?…\s]+$/g, '');
  return phrase ? `, ${phrase} ,` : '';
}

export function clampPlaybackSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return SPEECH_PLAYBACK_SPEEDS.reduce(
    (closest, candidate) =>
      Math.abs(candidate - speed) + 1e-9 < Math.abs(closest - speed) ? candidate : closest,
    1
  );
}

export function normalizeCustomPlaybackSpeed(speed: number): number {
  return normalizeSpeedValue(speed, 1);
}
