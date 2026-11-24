// language: JavaScript, file: server/transcribe.js, target: Node.js / Local dev proxy
import { keyRotator } from './llm.js';

const CACHE_LIMIT = 300;
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

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

async function lookupGeminiIpa(text, language) {
  const keys = keyRotator?.getKeysForRequest?.() || [];
  if (keys.length === 0) return '';

  const langLabel = language === 'da' ? 'Danish' : 'English';
  const prompt = `Exact standard International Phonetic Alphabet (IPA) for ${langLabel} text: ${JSON.stringify(text)}. Include stress marks (ˈ) and stød (ˀ) where appropriate. Output ONLY the IPA transcription enclosed in slashes /.../ with NO other text.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_500);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${keys[0]}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 160, temperature: 0.1 }
      })
    });
    if (!res.ok) return '';
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const match = raw.match(/\/([^\n/]+)\//);
    if (match?.[0]) return match[0];
    if (raw.startsWith('/') && raw.endsWith('/')) return raw;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
  return '';
}

async function lookupEnglishIpa(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!clean) return '';

  try {
    const response = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`,
      {},
      5_000
    );
    if (!response.ok) return '';

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return '';

    const entry = data[0];
    if (typeof entry.phonetic === 'string' && entry.phonetic.trim()) return entry.phonetic.trim();
    const phonetic = entry.phonetics?.find((item) => typeof item.text === 'string' && item.text.trim());
    return typeof phonetic?.text === 'string' ? phonetic.text.trim() : '';
  } catch {
    return '';
  }
}

async function lookupDanishIpa(word) {
  const clean = word.toLowerCase().replace(/[^a-zæøå]/g, '');
  if (!clean) return '';

  try {
    const response = await fetchWithTimeout(
      `https://en.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(
        clean
      )}&format=json&origin=*`,
      {},
      5_000
    );
    if (!response.ok) return '';

    const data = await response.json();
    const pages = data.query?.pages;
    if (!pages) return '';

    const page = Object.values(pages)[0];
    const content = page?.revisions?.[0]?.['*'] ?? page?.revisions?.[0]?.content ?? '';
    if (!content) return '';

    const match =
      content.match(/\{\{IPA\|da\|([^}|]+)/i) ??
      content.match(/\{\{lyd\|da\|([^}|]+)/i) ??
      content.match(/\[([a-zæøåɡðŋʁɕʑʔˈˌː.\s]+)\]/i);

    if (!match?.[1]) return '';
    const ipa = match[1].replace(/[[\]/]/g, '').trim();
    return ipa ? `/${ipa}/` : '';
  } catch {
    return '';
  }
}

async function resolveIpa(text, language) {
  const clean = text.trim();
  if (!clean || clean.split(/\s+/).length > 20) return '';

  // 1. Primary: High-precision phonetic IPA via Gemini
  try {
    const geminiIpa = await lookupGeminiIpa(clean, language);
    if (geminiIpa) return geminiIpa;
  } catch (err) {
    console.warn('[transcribe] Gemini IPA lookup failed:', err.message);
  }

  // 2. Secondary fallback: Dictionary / Wiktionary word-by-word lookup
  const words = clean.split(/\s+/).filter(Boolean).slice(0, 10);
  const values = await Promise.all(
    words.map((word) => (language === 'da' ? lookupDanishIpa(word) : lookupEnglishIpa(word)))
  );
  return values.filter(Boolean).join(' ');
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
