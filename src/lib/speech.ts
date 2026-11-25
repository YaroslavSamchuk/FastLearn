// language: TypeScript, file: src/lib/speech.ts, target: Web

const CODE_FENCE = /```[\s\S]*?```/g;
const MARKUP = /[*_`#~]+/g;
const PICTOGRAPHS = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;

export const PHRASE_PLAYBACK_SPEEDS = [1, 0.7, 0.4] as const;

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

export function clampPlaybackSpeed(speed: number, allowPhraseSpeeds = false): number {
  if (!Number.isFinite(speed)) return 1;
  const speeds = allowPhraseSpeeds ? [1, 0.8, 0.6, ...PHRASE_PLAYBACK_SPEEDS] : [1, 0.8, 0.6];
  return speeds.reduce(
    (closest, candidate) =>
      Math.abs(candidate - speed) + 1e-9 < Math.abs(closest - speed) ? candidate : closest,
    1
  );
}

export function applySpeechPlaybackRate(
  audio: Pick<HTMLAudioElement, 'playbackRate' | 'defaultPlaybackRate' | 'preservesPitch'>,
  speed: number
): void {
  const rate = clampPlaybackSpeed(speed, true);
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  audio.preservesPitch = true;
}
