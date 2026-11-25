// language: JavaScript, file: server/transcribe.js, target: Node.js / Local dev proxy
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lookupWordFallbackFromDictionaries,
  resolveWordListPronunciation
} from './ipa.js';

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

async function translateWithMyMemory(text, sourceLang, targetLang, signal) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal
    },
    7_000
  );

  if (!response.ok) throw new Error(`MyMemory returned HTTP ${response.status}`);
  const data = await response.json();
  const candidate = data.responseData?.translatedText;
  if (!candidate || typeof candidate !== 'string') return '';
  if (candidate.toUpperCase().includes('MYMEMORY WARNING')) return '';
  return candidate.trim();
}

async function translateWithGoogle(text, sourceLang, targetLang, signal) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceLang);
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal
    },
    8_000
  );

  if (!response.ok) throw new Error(`Google Translate returned HTTP ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) return '';

  return data[0]
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
    .join('')
    .trim();
}

async function translateText(text, sourceLang, targetLang) {
  const controllers = [new AbortController(), new AbortController()];
  const providers = [
    () => translateWithMyMemory(text, sourceLang, targetLang, controllers[0].signal),
    () => translateWithGoogle(text, sourceLang, targetLang, controllers[1].signal)
  ];

  try {
    return await Promise.any(providers.map(async (provider) => {
      const result = await provider();
      if (!result || result.toLowerCase() === text.toLowerCase()) {
        throw new Error('Translation provider returned no translated text');
      }
      return result;
    }));
  } catch {
    return '';
  } finally {
    controllers.forEach((controller) => controller.abort());
  }
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
