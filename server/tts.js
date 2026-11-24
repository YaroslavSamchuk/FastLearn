// language: JavaScript, file: server/tts.js, target: Node.js / Local dev proxy
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const VOICES = {
  da: {
    female: 'da-DK-ChristelNeural',
    male: 'da-DK-JeppeNeural',
    default: 'da-DK-JeppeNeural'
  },
  en: {
    female: 'en-US-JennyNeural',
    male: 'en-US-GuyNeural',
    default: 'en-US-JennyNeural'
  }
};

const TTS_CHUNK_CHARS = 180;
const CACHE_LIMIT = 40;
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

let edgeCooldownUntil = 0;

export function mapSpeedToRate(speed) {
  const value = Number.parseFloat(speed);
  if (!Number.isFinite(value)) return '-20%';
  const percentage = Math.round((value - 1) * 100);
  return `${percentage >= 0 ? '+' : ''}${percentage}%`;
}

function collectStream(stream, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => {
      try {
        stream.destroy?.();
      } catch {
        // Stream already closed.
      }
      reject(new Error('Edge TTS timed out'));
    }, timeoutMs);

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function synthesizeEdge(text, language, speed, voiceName) {
  if (Date.now() < edgeCooldownUntil) return null;

  const primaryVoice = voiceName || VOICES[language]?.default || VOICES.en.default;
  const voicesToTry = [primaryVoice];
  // If user or caller specified Christel, keep Jeppe as immediate fallback
  if (language === 'da' && primaryVoice === 'da-DK-ChristelNeural') {
    voicesToTry.push('da-DK-JeppeNeural');
  }

  for (const voice of voicesToTry) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const stream = await tts.toStream(text, {
        rate: mapSpeedToRate(speed),
        pitch: '+0Hz'
      });

      const buffer = await collectStream(stream.audioStream, 9_000);
      if (buffer.byteLength > 0) return buffer;
    } catch (error) {
      console.warn(`[tts] Edge voice ${voice} attempt failed:`, error.message);
    }
  }

  // Brief 30s cooldown before retrying Edge TTS if both attempts failed
  edgeCooldownUntil = Date.now() + 30 * 1000;
  console.warn('[tts] Edge TTS unavailable, using Google fallback');
  return null;
}

function splitText(text, maxChars) {
  const chunks = [];
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).trim().length <= maxChars) {
      current += sentence;
      continue;
    }

    if (current.trim()) chunks.push(current.trim());
    current = '';

    if (sentence.trim().length <= maxChars) {
      current = sentence;
      continue;
    }

    for (const word of sentence.split(/\s+/).filter(Boolean)) {
      if (`${current} ${word}`.trim().length <= maxChars) {
        current = `${current} ${word}`.trim();
      } else {
        if (current) chunks.push(current);
        current = word.slice(0, maxChars);
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

async function googleChunk(text, language, speed) {
  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('tl', language);
  url.searchParams.set('ttsspeed', String(speed));
  url.searchParams.set('total', '1');
  url.searchParams.set('idx', '0');
  url.searchParams.set('textlen', String(text.length));
  url.searchParams.set('q', text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.5',
        Referer: 'https://translate.google.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Google TTS returned HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('audio')) {
      throw new Error(`Google TTS returned ${contentType || 'an unknown content type'}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) throw new Error('Google TTS returned an empty audio file');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeGoogle(text, language, speed) {
  const chunks = splitText(text, TTS_CHUNK_CHARS);
  const buffers = [];
  for (const chunk of chunks) {
    buffers.push(await googleChunk(chunk, language, speed));
  }
  return Buffer.concat(buffers);
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

export async function synthesizeSpeech(text, language = 'da', speed = 0.80, voiceName = null) {
  const cleanText = text.trim();
  const safeSpeed = Math.max(0.5, Math.min(1.4, Number.parseFloat(speed) || 0.80));
  const voice = voiceName || VOICES[language]?.default || VOICES.en.default;
  const cacheKey = `${language}:${safeSpeed}:${voice}:${cleanText}`;
  const cached = readCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  let buffer = await synthesizeEdge(cleanText, language, safeSpeed, voice);
  let source = 'edge';

  if (!buffer) {
    buffer = await synthesizeGoogle(cleanText, language, Math.min(1, safeSpeed));
    source = 'google';
  }

  const result = { buffer, source };
  writeCache(cacheKey, result);
  return { ...result, cached: false };
}
