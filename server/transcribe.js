// language: JavaScript, file: server/transcribe.js, target: Node.js / Local dev proxy
import { keyRotator } from './llm.js';

const CACHE_LIMIT = 300;
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function translateWithMyMemory(text, sourceLang, targetLang) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
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

async function translateWithGoogle(text, sourceLang, targetLang) {
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
      }
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
  // 1. Primary: MyMemory Translator (neural / translation memory)
  try {
    const result = await translateWithMyMemory(text, sourceLang, targetLang);
    if (result && result.toLowerCase() !== text.toLowerCase()) {
      return result;
    }
  } catch (err) {
    console.warn('[transcribe] MyMemory failed, falling back to Google:', err.message);
  }

  // 2. Secondary fallback: Google Translate GTX
  return translateWithGoogle(text, sourceLang, targetLang);
}

async function lookupGeminiIpa(text, language) {
  const keys = keyRotator?.getKeysForRequest?.() || [];
  if (keys.length === 0) return '';

  const langLabel = language === 'da' ? 'Danish' : 'English';
  const prompt = `Exact standard International Phonetic Alphabet (IPA) for ${langLabel} text: ${JSON.stringify(text)}. Include stress marks (ˈ) and stød (ˀ) where appropriate. Output ONLY the IPA transcription enclosed in slashes /.../ with NO other text.`;

  const models = ['gemini-flash-lite-latest', 'gemini-3-flash-preview'];
  for (const model of models) {
    for (const key of keys.slice(0, 3)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4_500);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 35, temperature: 0.1 }
          })
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        const match = raw.match(/\/([^\n/]+)\//);
        if (match?.[0]) return match[0];
        if (raw.startsWith('/') && raw.endsWith('/')) return raw;
      } catch {
        // try next key
      }
    }
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
  if (!clean || clean.split(/\s+/).length > 10) return '';

  // 1. Primary: High-precision phonetic IPA via Gemini
  try {
    const geminiIpa = await lookupGeminiIpa(clean, language);
    if (geminiIpa) return geminiIpa;
  } catch (err) {
    console.warn('[transcribe] Gemini IPA lookup failed:', err.message);
  }

  // 2. Secondary fallback: Dictionary / Wiktionary word-by-word lookup
  const words = clean.split(/\s+/).filter(Boolean).slice(0, 4);
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

export async function resolveTranscriptionAndTranslation(text, sourceLang = 'da', userLang = 'uk') {
  const cleanText = text.trim();
  const cacheKey = `${sourceLang}:${userLang}:${cleanText.toLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const [translation, ipa] = await Promise.all([
    translateText(cleanText, sourceLang, userLang),
    resolveIpa(cleanText, sourceLang)
  ]);

  if (!translation) throw new Error('Translation service returned an empty result');

  const result = {
    original: cleanText,
    translation,
    ipa,
    sourceLang,
    userLang
  };

  writeCache(cacheKey, result);
  return result;
}
