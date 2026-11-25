// language: TypeScript, file: server/ipa.d.ts, target: TypeScript declaration for server/ipa.js
export const MAX_IPA_WORDS: number;
export const MAX_IPA_FALLBACK_WORDS: number;

export function ipaShardHash(word: string): string;
export function nstSampaToDdo(sampa: string): string;
export function normalizeWordForIpa(rawWord: string, language: 'da' | 'en'): string;
export function splitWordsForIpa(
  text: string,
  maxWords?: number
): { words: string[]; tooLong: boolean };
export function lookupWordInTsvShard(shardText: string, word: string): string;
export function extractOrdnetDdo(html: string): string;
export function extractUdtaleordbogDdo(html: string): string;
export function extractWiktionaryDanishDdo(wikitext: string): string;
export function extractDictionaryApiPhonetic(data: unknown): string;
export function lookupWordFallbackFromDictionaries(
  word: string,
  language: 'da' | 'en'
): Promise<string>;
export function resolveWordListPronunciation(
  text: string,
  language: 'da' | 'en',
  options: {
    readShard: (language: 'da' | 'en', hash: string) => Promise<string>;
    fetchFallbackWord?: (word: string, language: 'da' | 'en') => Promise<string>;
  }
): Promise<string>;
