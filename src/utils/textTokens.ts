// language: TypeScript, file: src/utils/textTokens.ts, target: Web / Mobile Browser

export interface WordToken {
  index: number;
  text: string;
  separator: string;
  isBold?: boolean;
  isItalic?: boolean;
}

// Regex matching markdown bold/italic tags
const EMPHASIS_REGEX = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;

/**
 * Parses message text into a list of word tokens with attached punctuation,
 * preserving spacing, line breaks, and emphasis (bold/italic).
 */
export function tokenizeMessage(content: string): WordToken[] {
  if (!content) return [];

  const tokens: WordToken[] = [];
  let tokenIndex = 0;

  // 1. Split into emphasis segments
  const segments = content.split(EMPHASIS_REGEX);

  for (const segment of segments) {
    if (!segment) continue;

    const isBold = segment.startsWith('**') || segment.startsWith('__');
    const isItalic = !isBold && (segment.startsWith('*') || segment.startsWith('_'));
    const rawText = isBold ? segment.slice(2, -2) : isItalic ? segment.slice(1, -1) : segment;

    // 2. Parse words and their trailing separators (spaces, newlines, tabs)
    // Matches non-whitespace sequence followed by optional whitespace sequence
    const wordPattern = /(\S+)(\s*)/g;
    let match: RegExpExecArray | null;

    while ((match = wordPattern.exec(rawText)) !== null) {
      const word = match[1];
      const sep = match[2] || '';

      if (word) {
        tokens.push({
          index: tokenIndex++,
          text: word,
          separator: sep,
          isBold: isBold || undefined,
          isItalic: isItalic || undefined
        });
      }
    }
  }

  return tokens;
}

/**
 * Cleans extracted token text for translation API (removes stray outer quotes/brackets if single word)
 */
export function cleanTextForTranslation(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  // If it's a single word with wrapping quotes or brackets, e.g. "(Mere" or '"Hej!"'
  if (!/\s/.test(trimmed)) {
    return trimmed.replace(/^[«"'({\[]+/, '').replace(/[»"')}\]]+$/, '') || trimmed;
  }

  return trimmed;
}
