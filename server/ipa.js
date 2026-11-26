// language: JavaScript, file: server/ipa.js, target: Cloudflare Workers & Node.js

export const MAX_IPA_WORDS = 20;
export const MAX_IPA_FALLBACK_WORDS = 10;

const NST_CHAR_MAP = {
  '2': 'ø',
  '9': 'œ',
  '6': 'ɐ',
  '@': 'ə',
  A: 'ɑ',
  E: 'ɛ',
  O: 'ɔ',
  Q: 'ɒ',
  D: 'ð',
  N: 'ŋ',
  R: 'ʁ',
  g: 'ɡ'
};

/**
 * Computes a deterministic 2-hex-digit FNV-1a bucket hash ('00'..'ff')
 * matching the static TSV shard filenames under /ipa/{lang}/{hash}.txt.
 */
export function ipaShardHash(word) {
  let hash = 2166136261;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash & 0xff).toString(16).padStart(2, '0');
}

/**
 * Converts an NST Danish X-SAMPA transcription string into Den Danske Ordbog (DDO) notation.
 */
export function nstSampaToDdo(sampa) {
  if (typeof sampa !== 'string') return '';
  let normalized = sampa
    .trim()
    .replace(/[$¤]/g, '')
    .replace(/_/g, ' ')
    .replace(/s'|s!/g, 'ɕ')
    .replace(/"/g, 'ˈ')
    .replace(/%/g, 'ˌ')
    .replace(/:/g, 'ː')
    .replace(/\?/g, 'ˀ')
    .replace(/'/g, '');

  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    out += NST_CHAR_MAP[ch] ?? ch;
  }

  const trimmed = out.trim();
  return trimmed ? `[${trimmed}]` : '';
}

/**
 * Strips leading/trailing punctuation while keeping internal letters, apostrophes, and hyphens.
 */
export function normalizeWordForIpa(rawWord, language) {
  if (typeof rawWord !== 'string') return '';
  const lower = rawWord.trim().toLowerCase();
  if (!lower) return '';

  const stripped =
    language === 'da'
      ? lower.replace(/^[^a-zæøå0-9]+|[^a-zæøå0-9-]+$/g, '')
      : lower.replace(/^[^a-z0-9]+|[^a-z0-9'-]+$/g, '');

  if (!stripped) return '';
  return /[a-zæøå]/i.test(stripped) ? stripped : '';
}

/**
 * Splits input phrase by whitespace and rejects phrases longer than MAX_IPA_WORDS.
 */
export function splitWordsForIpa(text, maxWords = MAX_IPA_WORDS) {
  if (typeof text !== 'string') return { words: [], tooLong: false };
  const rawTokens = text.trim().split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return { words: [], tooLong: false };
  if (rawTokens.length > maxWords) return { words: [], tooLong: true };
  return { words: rawTokens, tooLong: false };
}

/**
 * Performs zero-allocation substring lookup inside a newline-framed TSV shard (`\nword\tipa\n`).
 */
export function lookupWordInTsvShard(shardText, word) {
  if (!shardText || !word) return '';
  const needle = `\n${word}\t`;
  const idx = shardText.indexOf(needle);
  if (idx === -1) return '';
  const valueStart = idx + needle.length;
  const lineEnd = shardText.indexOf('\n', valueStart);
  const value = (lineEnd === -1 ? shardText.slice(valueStart) : shardText.slice(valueStart, lineEnd)).trim();
  return value.endsWith('\r') ? value.slice(0, -1).trim() : value;
}

/**
 * Parses Den Danske Ordbog (ordnet.dk) `<span class="lydskrift">` button text.
 * When expectedWord is provided, ignores fuzzy-redirected articles whose headword differs.
 */
export function extractOrdnetDdo(html, expectedWord = '') {
  if (typeof html !== 'string' || !html) return '';
  if (expectedWord) {
    const headwordMatch = html.match(/<span class="match"[^>]*>([\s\S]*?)<\/span>/i);
    if (headwordMatch?.[1]) {
      const headword = headwordMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/^[0-9.\s*]+|[0-9.\s*]+$/g, '')
        .trim()
        .toLowerCase();
      if (headword && headword !== expectedWord.toLowerCase()) {
        return '';
      }
    }
  }
  const match = html.match(
    /class="lydskrift"[^>]*>\s*<span class="kilde-group[^"]*">\s*<button[^>]*>([\s\S]*?)<\/button>/i
  );
  if (!match?.[1]) return '';
  const cleaned = match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.startsWith('[') && cleaned.endsWith(']')
    ? cleaned
    : `[${cleaned.replace(/^\[|\]$/g, '').trim()}]`;
}

/**
 * Parses udtaleordbog.dk DDO output (`std=DDO`) from `<span class="ipa">` elements.
 */
export function extractUdtaleordbogDdo(html) {
  if (typeof html !== 'string' || !html) return '';
  const matches = html.matchAll(/<span class="ipa"[^>]*>([\s\S]*?)<\/span>/gi);
  for (const match of matches) {
    const cleaned = match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) {
      return cleaned.startsWith('[') && cleaned.endsWith(']')
        ? cleaned
        : `[${cleaned.replace(/^[[\]/]+|[[\]/]+$/g, '').trim()}]`;
    }
  }
  return '';
}

/**
 * Extracts Danish pronunciation from raw English Wiktionary wikitext.
 */
export function extractWiktionaryDanishDdo(wikitext) {
  if (typeof wikitext !== 'string' || !wikitext) return '';
  const match =
    wikitext.match(/\{\{IPA\|da\|([^}|]+)/i) ??
    wikitext.match(/\{\{lyd\|da\|([^}|]+)/i) ??
    wikitext.match(/\[([a-zæøåɡðŋʁɕʑʔˈˌː.\s]+)\]/i);
  if (!match?.[1]) return '';
  const inner = match[1].replace(/[[\]/]/g, '').trim();
  return inner ? `[${inner}]` : '';
}

/**
 * Extracts English phonetic IPA from api.dictionaryapi.dev JSON payload.
 */
export function extractDictionaryApiPhonetic(data) {
  if (!Array.isArray(data) || data.length === 0) return '';
  const entry = data[0];
  if (!entry || typeof entry !== 'object') return '';
  if (typeof entry.phonetic === 'string' && entry.phonetic.trim()) {
    return entry.phonetic.trim();
  }
  if (Array.isArray(entry.phonetics)) {
    const phonetic = entry.phonetics.find((item) => typeof item?.text === 'string' && item.text.trim());
    if (phonetic?.text) return phonetic.text.trim();
  }
  return '';
}

/**
 * Fetches text over HTTP with a strict timeout.
 */
async function fetchWithTimeoutText(url, timeoutMs = 3_500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: controller.signal
    });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function lookupEnglishWiktionary(cleanWord) {
  const raw = await fetchWithTimeoutText(
    `https://en.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(
      cleanWord
    )}&format=json&origin=*`,
    2_800
  );
  if (!raw) return '';
  try {
    const data = JSON.parse(raw);
    const pages = data.query?.pages;
    if (!pages) return '';
    const page = Object.values(pages)[0];
    const content = page?.revisions?.[0]?.['*'] ?? page?.revisions?.[0]?.content ?? '';
    if (!content) return '';
    const match = content.match(/\{\{IPA\|en\|([^}|]+)/i);
    if (!match?.[1]) return '';
    const inner = match[1].replace(/[[\]/]/g, '').trim();
    return inner ? `/${inner}/` : '';
  } catch {
    return '';
  }
}

async function lookupDanishWiktionary(cleanWord) {
  const raw = await fetchWithTimeoutText(
    `https://en.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(
      cleanWord
    )}&format=json&origin=*`,
    2_800
  );
  if (!raw) return '';
  try {
    const data = JSON.parse(raw);
    const pages = data.query?.pages;
    if (!pages) return '';
    const page = Object.values(pages)[0];
    const content = page?.revisions?.[0]?.['*'] ?? page?.revisions?.[0]?.content ?? '';
    return extractWiktionaryDanishDdo(content);
  } catch {
    return '';
  }
}

/**
 * Looks up pronunciation for an out-of-vocabulary word using free real dictionaries in parallel (never LLMs).
 */
export async function lookupWordFallbackFromDictionaries(word, language) {
  const firstNonEmpty = async (tasks) => {
    try {
      return await Promise.any(
        tasks.map(async (run) => {
          const result = await run();
          if (!result) throw new Error('Empty dictionary pronunciation');
          return result;
        })
      );
    } catch {
      return '';
    }
  };

  if (language === 'da') {
    const clean = word.toLowerCase().replace(/[^a-zæøå-]/g, '');
    if (!clean) return '';

    return firstNonEmpty([
      async () => {
        const html = await fetchWithTimeoutText(
          `https://udtaleordbog.dk/search.php?s=${encodeURIComponent(clean)}&std=DDO`,
          2_800
        );
        return extractUdtaleordbogDdo(html);
      },
      async () => {
        const html = await fetchWithTimeoutText(
          `https://ordnet.dk/ddo/ordbog?query=${encodeURIComponent(clean)}`,
          2_800
        );
        return extractOrdnetDdo(html, clean);
      },
      () => lookupDanishWiktionary(clean)
    ]);
  }

  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!clean) return '';

  return firstNonEmpty([
    async () => {
      const rawDict = await fetchWithTimeoutText(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`,
        2_800
      );
      if (!rawDict) return '';
      try {
        return extractDictionaryApiPhonetic(JSON.parse(rawDict));
      } catch {
        return '';
      }
    },
    () => lookupEnglishWiktionary(clean)
  ]);
}

async function resolveMissingWordsInShards(words, language, readShard, shardCache) {
  const missingByHash = new Map();
  for (const word of words) {
    const hash = ipaShardHash(word);
    if (!missingByHash.has(hash)) missingByHash.set(hash, []);
    missingByHash.get(hash).push(word);
  }

  const found = new Map();
  await Promise.all(
    Array.from(missingByHash.entries()).map(async ([hash, bucketWords]) => {
      let text = shardCache.get(hash);
      if (text === undefined) {
        text = await readShard(language, hash).catch(() => '');
        shardCache.set(hash, text || '');
      }
      if (!text) return;
      for (const word of bucketWords) {
        const value = lookupWordInTsvShard(text, word);
        if (value) found.set(word, value);
      }
    })
  );

  return found;
}

const MIN_COMPOUND_WORD_LENGTH = 6;
const MIN_COMPOUND_PART_LENGTH = 3;

function stripIpaDelimiters(value) {
  return value.replace(/^[[\]/]+|[[\]/]+$/g, '').trim();
}

function buildCompoundCandidates(word, language) {
  if (word.length < MIN_COMPOUND_WORD_LENGTH || /[-']/.test(word)) return [];
  const candidates = [];

  for (let i = MIN_COMPOUND_PART_LENGTH; i <= word.length - MIN_COMPOUND_PART_LENGTH; i++) {
    const directLeft = word.slice(0, i);
    const directRight = word.slice(i);
    candidates.push({
      left: directLeft,
      linker: '',
      right: directRight,
      score: Math.min(directLeft.length, directRight.length) * 100 + 20
    });

    if (language === 'da' && i <= word.length - MIN_COMPOUND_PART_LENGTH - 1) {
      const sep = word[i];
      if (sep === 's' || sep === 'e') {
        const linkedLeft = word.slice(0, i);
        const linkedRight = word.slice(i + 1);
        candidates.push({
          left: linkedLeft,
          linker: sep === 's' ? 's' : 'ə',
          right: linkedRight,
          score: Math.min(linkedLeft.length, linkedRight.length) * 100 + (sep === 's' ? 10 : 0)
        });
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function joinCompoundPronunciation(leftValue, linker, rightValue, language) {
  const leftInner = stripIpaDelimiters(leftValue);
  const rightInner = stripIpaDelimiters(rightValue);
  if (!leftInner || !rightInner) return '';

  const rightDemoted = /[ˈ']/.test(rightInner)
    ? rightInner.replace(/[ˈ']/, 'ˌ')
    : rightInner.startsWith('ˌ')
      ? rightInner
      : `ˌ${rightInner}`;

  const combined = `${leftInner}${linker}${rightDemoted}`;
  return language === 'da' ? `[${combined}]` : `/${combined}/`;
}

async function resolveClosedCompoundsInShards(words, language, readShard, shardCache, resolved) {
  const perWordCandidates = new Map();
  const neededParts = new Set();

  for (const word of words) {
    if (resolved.has(word)) continue;
    const candidates = buildCompoundCandidates(word, language);
    if (candidates.length === 0) continue;
    perWordCandidates.set(word, candidates);
    for (const candidate of candidates) {
      if (!resolved.has(candidate.left)) neededParts.add(candidate.left);
      if (!resolved.has(candidate.right)) neededParts.add(candidate.right);
    }
  }

  if (neededParts.size === 0) return;

  const foundParts = await resolveMissingWordsInShards(
    Array.from(neededParts),
    language,
    readShard,
    shardCache
  );
  for (const [part, ipa] of foundParts) {
    resolved.set(part, ipa);
  }

  for (const [word, candidates] of perWordCandidates) {
    for (const candidate of candidates) {
      const leftIpa = resolved.get(candidate.left);
      const rightIpa = resolved.get(candidate.right);
      if (!leftIpa || !rightIpa) continue;
      const joined = joinCompoundPronunciation(leftIpa, candidate.linker, rightIpa, language);
      if (joined) {
        resolved.set(word, joined);
        break;
      }
    }
  }
}

/**
 * Resolves pronunciation for up to MAX_IPA_WORDS tokens using local TSV shards first
 * (including hyphenated and closed compound words),
 * then up to MAX_IPA_FALLBACK_WORDS external dictionary lookups for remaining tokens.
 */
export async function resolveWordListPronunciation(
  text,
  language,
  { readShard, fetchFallbackWord }
) {
  const { words: rawTokens, tooLong } = splitWordsForIpa(text, MAX_IPA_WORDS);
  if (tooLong || rawTokens.length === 0) return '';

  const normalizedTokens = rawTokens
    .map((token) => normalizeWordForIpa(token, language))
    .filter(Boolean);
  if (normalizedTokens.length === 0) return '';

  const uniqueWords = Array.from(new Set(normalizedTokens));
  const shardCache = new Map();
  const resolved = await resolveMissingWordsInShards(uniqueWords, language, readShard, shardCache);

  // If a hyphenated token wasn't an exact lexicon headword, resolve its hyphen parts locally.
  const unresolvedHyphens = uniqueWords.filter((word) => !resolved.has(word) && word.includes('-'));
  if (unresolvedHyphens.length > 0) {
    const subParts = Array.from(
      new Set(
        unresolvedHyphens.flatMap((word) => word.split('-').filter((part) => part.length > 0))
      )
    ).filter((part) => !resolved.has(part));

    if (subParts.length > 0) {
      const subResolved = await resolveMissingWordsInShards(subParts, language, readShard, shardCache);
      for (const [k, v] of subResolved) resolved.set(k, v);
      await resolveClosedCompoundsInShards(subParts, language, readShard, shardCache, resolved);
    }

    for (const word of unresolvedHyphens) {
      const parts = word.split('-').filter(Boolean);
      const partValues = parts.map((part) => resolved.get(part) || '');
      if (partValues.length > 0 && partValues.every(Boolean)) {
        resolved.set(word, partValues.join('-'));
      }
    }
  }

  // Decompose unhyphenated closed compounds (e.g. dansktræning = dansk + træning) from local shards.
  const unresolvedClosed = uniqueWords.filter((word) => !resolved.has(word));
  if (unresolvedClosed.length > 0) {
    await resolveClosedCompoundsInShards(unresolvedClosed, language, readShard, shardCache, resolved);
  }

  const stillMissing = uniqueWords
    .filter((word) => !resolved.has(word))
    .slice(0, MAX_IPA_FALLBACK_WORDS);

  if (stillMissing.length > 0 && typeof fetchFallbackWord === 'function') {
    await Promise.all(
      stillMissing.map(async (word) => {
        const value = await fetchFallbackWord(word, language).catch(() => '');
        if (value) resolved.set(word, value);
      })
    );
  }

  const parts = normalizedTokens
    .map((word) => resolved.get(word) || '')
    .filter(Boolean);
  if (parts.length === 0) return '';

  const inner = parts.map((item) => stripIpaDelimiters(item)).filter(Boolean);
  if (inner.length === 0) return '';

  return language === 'da' ? `[${inner.join(' ')}]` : `/${inner.join(' ')}/`;
}
