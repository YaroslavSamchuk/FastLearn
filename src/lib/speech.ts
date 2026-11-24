// language: TypeScript, file: src/lib/speech.ts, target: Web

const CODE_FENCE = /```[\s\S]*?```/g;
const MARKUP = /[*_`#~]+/g;
const PICTOGRAPHS = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;

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
