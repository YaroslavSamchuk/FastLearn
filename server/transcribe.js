// language: JavaScript, file: server/transcribe.js, target: Node.js / Local dev proxy
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lookupWordFallbackFromDictionaries,
  resolveWordListPronunciation
} from './ipa.js';
import { keyRotator } from './llm.js';
import { DEFAULT_GEMINI_MODELS, getFastThinkingConfig } from './modelConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_IPA_DIR = path.resolve(__dirname, '..', 'public', 'ipa');

const CACHE_LIMIT = 300;
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

const SHARD_CACHE_LIMIT = 64;
const shardCache = new Map();

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    forwardAbort();
  } else {
    options.signal?.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}

const GOOGLE_TRANSLATE_TIMEOUT_MS = 1_500;
const GOOGLE_TRANSLATE_COOLDOWN_MS = 120_000;
let googleTranslateCooldownUntil = 0;

function isSameNormalizedText(left, right) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

async function translateWithGoogle(text, sourceLang, targetLang, signal) {
  if (Date.now() < googleTranslateCooldownUntil) return '';

  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceLang);
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  try {
    const response = await fetchWithTimeout(
      url.toString(),
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        signal
      },
      GOOGLE_TRANSLATE_TIMEOUT_MS
    );

    if (response.status === 429 || response.status === 403) {
      googleTranslateCooldownUntil = Date.now() + GOOGLE_TRANSLATE_COOLDOWN_MS;
      return '';
    }
    if (!response.ok) return '';

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json') && !contentType.includes('javascript')) return '';

    const data = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) return '';

    const translated = data[0]
      .map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
      .join('')
      .trim();

    if (!translated || isSameNormalizedText(translated, text)) return '';
    return translated;
  } catch {
    return '';
  }
}

async function translateWithGemini(text, sourceLang, targetLang) {
  const keys = keyRotator.getKeysForRequest().slice(0, 2);
  if (keys.length === 0) return '';

  const models = (process.env.GEMINI_MODELS || DEFAULT_GEMINI_MODELS)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
    .slice(0, 2);

  const languageNames = { da: 'Danish', en: 'English', uk: 'Ukrainian' };
  const prompt = `Translate this ${languageNames[sourceLang] ?? sourceLang} text into ${languageNames[targetLang] ?? targetLang}. Preserve its meaning and punctuation. Return only the translation, with no explanation or quotes.\n\n${JSON.stringify(text)}`;

  for (const model of models) {
    const thinkingConfig = getFastThinkingConfig(model);
    for (const key of keys) {
      try {
        const response = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 120,
                temperature: 0.1,
                ...(thinkingConfig ? { thinkingConfig } : {})
              }
            })
          },
          3_500
        );

        if (!response.ok) {
          keyRotator.reportFailure(key, response.status);
          continue;
        }

        keyRotator.reportSuccess(key);
        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const translation = parts
          .filter((part) => !part.thought && typeof part.text === 'string')
          .map((part) => part.text ?? '')
          .join('')
          .trim();
        if (translation) return translation;
      } catch {
        // try next key/model
      }
    }
  }

  return '';
}

async function translateText(text, sourceLang, targetLang) {
  const googleResult = await translateWithGoogle(text, sourceLang, targetLang);
  if (googleResult) return googleResult;
  return translateWithGemini(text, sourceLang, targetLang);
}

async function readLocalShard(language, hash) {
  const cacheKey = `${language}:${hash}`;
  if (shardCache.has(cacheKey)) return shardCache.get(cacheKey);

  try {
    const filePath = path.join(PUBLIC_IPA_DIR, language, `${hash}.txt`);
    const text = await fs.readFile(filePath, 'utf8');
    shardCache.set(cacheKey, text);
    if (shardCache.size > SHARD_CACHE_LIMIT) {
      const oldest = shardCache.keys().next().value;
      if (oldest) shardCache.delete(oldest);
    }
    return text;
  } catch {
    shardCache.set(cacheKey, '');
    return '';
  }
}

async function resolveIpa(text, language) {
  return resolveWordListPronunciation(text, language, {
    readShard: readLocalShard,
    fetchFallbackWord: lookupWordFallbackFromDictionaries
  });
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function mergeCache(key, value) {
  writeCache(key, { ...(readCache(key) ?? {}), ...value });
}

export async function resolveTranscriptionAndTranslation(text, sourceLang = 'da', userLang = 'uk') {
  const cleanText = text.trim();
  const cacheKey = `${sourceLang}:${userLang}:${cleanText.toLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached?.translation && cached.ipa) return cached;

  const [translation, ipa] = await Promise.all([
    cached?.translation ?? translateText(cleanText, sourceLang, userLang),
    cached?.ipa || resolveIpa(cleanText, sourceLang)
  ]);

  if (!translation) throw new Error('Translation service returned an empty result');

  const result = {
    original: cleanText,
    translation,
    ipa,
    sourceLang,
    userLang
  };

  mergeCache(cacheKey, { ...result, ...(ipa ? {} : { ipa: undefined }) });
  return result;
}

export async function resolveTranslation(text, sourceLang = 'da', userLang = 'uk') {
  const cleanText = text.trim();
  const cacheKey = `${sourceLang}:${userLang}:${cleanText.toLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached?.translation) return cached.translation;

  const translation = await translateText(cleanText, sourceLang, userLang);
  if (!translation) throw new Error('Translation providers returned no translation');
  mergeCache(cacheKey, {
    original: cleanText,
    translation,
    sourceLang,
    userLang
  });
  return translation;
}

export async function resolveIpaOnly(text, language = 'da') {
  const cleanText = text.trim();
  const cacheKey = `${language}:uk:${cleanText.toLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached?.ipa) return cached.ipa;

  const ipa = await resolveIpa(cleanText, language);
  if (ipa) {
    mergeCache(cacheKey, {
      original: cleanText,
      ipa,
      sourceLang: language,
      userLang: 'uk'
    });
  }
  return ipa;
}
