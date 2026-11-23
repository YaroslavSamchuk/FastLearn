import { getDb } from './db.js';

const memoryCache = new Map();

// Free IPA lookup for single English word
async function getEnglishIPA(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return '';
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`);
    if (res.ok) {
      const data = await res.json();
      const phonetic = data[0]?.phonetic || data[0]?.phonetics?.find(p => p.text)?.text;
      if (phonetic) return phonetic;
    }
  } catch (e) {
    // silently fallback
  }
  return '';
}

// Free IPA lookup for single Danish word from Wiktionary
async function getDanishIPA(word) {
  const clean = word.toLowerCase().replace(/[^a-zæøå]/g, '');
  if (!clean) return '';
  try {
    const res = await fetch(`https://en.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(clean)}&format=json`);
    if (res.ok) {
      const data = await res.json();
      const pages = data.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        const content = pages[pageId]?.revisions?.[0]?.['*'] || '';
        // Look for {{IPA|da|...}} or [IPA]
        const m = content.match(/\{\{IPA\|da\|([^|}]+)/i) || content.match(/\[([a-zæøåɡðŋʁɕʑʔˈˌː\.\s]+)\]/i);
        if (m && m[1]) {
          return `/${m[1].trim()}/`;
        }
      }
    }
  } catch (e) {
    // fallback
  }
  return '';
}

// Free Google translation & transliteration
async function getGoogleTranslation(text, sourceLang, targetLang = 'uk') {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const translated = json[0]?.map(item => item[0]).filter(Boolean).join(' ') || '';
      return translated;
    }
  } catch (e) {
    console.error('[Translation] Google error:', e.message);
  }
  return text;
}

export async function resolveTranscriptionAndTranslation(text, sourceLang = 'da', userLang = 'uk') {
  const cacheKey = `${sourceLang}:${userLang}:${text.trim().toLowerCase()}`;

  // 1. Check in-memory cache
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  // 2. Check MongoDB cache
  try {
    const db = await getDb();
    const cached = await db.collection('transcription_cache').findOne({ key: cacheKey });
    if (cached) {
      memoryCache.set(cacheKey, cached.data);
      return cached.data;
    }
  } catch (e) {
    // Ignore DB cache read error
  }

  const cleanText = text.trim();
  const words = cleanText.split(/\s+/).slice(0, 30); // clamp up to 30 words

  // 3. Parallel fetch translation & phonetics
  const translationPromise = getGoogleTranslation(cleanText, sourceLang, userLang);

  let ipaPromise;
  if (words.length === 1) {
    const word = words[0];
    ipaPromise = sourceLang === 'da' ? getDanishIPA(word) : getEnglishIPA(word);
  } else if (words.length <= 4) {
    // For short phrases, resolve word by word IPA
    ipaPromise = Promise.all(
      words.map(w => sourceLang === 'da' ? getDanishIPA(w) : getEnglishIPA(w))
    ).then(ipas => {
      const filtered = ipas.filter(Boolean);
      return filtered.length > 0 ? filtered.join(' ') : '';
    });
  } else {
    // For longer phrases (up to 30 words), provide phrase representation
    ipaPromise = Promise.resolve('');
  }

  const [translation, ipa] = await Promise.all([translationPromise, ipaPromise]);

  const result = {
    original: cleanText,
    translation: translation || cleanText,
    ipa: ipa || (sourceLang === 'da' ? `[da: ${cleanText}]` : `/${cleanText}/`),
    sourceLang,
    userLang
  };

  // 4. Save to caches
  memoryCache.set(cacheKey, result);
  try {
    const db = await getDb();
    await db.collection('transcription_cache').updateOne(
      { key: cacheKey },
      { $set: { key: cacheKey, data: result, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    // non-fatal
  }

  return result;
}
