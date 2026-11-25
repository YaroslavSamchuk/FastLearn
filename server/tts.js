// language: JavaScript, file: server/tts.js, target: Node.js / Local dev proxy
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { Readable } from 'node:stream';
import { DEFAULT_VOICES, resolveVoice } from './ttsConfig.js';
import { synthesizeBingTranslatorTts } from './ttsProviders.js';

export const VOICES = {
  da: {
    female: 'da-DK-ChristelNeural',
    male: 'da-DK-JeppeNeural',
    default: DEFAULT_VOICES.da
  },
  en: {
    female: 'en-US-JennyNeural',
    male: 'en-US-GuyNeural',
    default: DEFAULT_VOICES.en
  }
};

const TTS_CHUNK_CHARS = 180;
const CACHE_LIMIT = 40;
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

let edgeCooldownUntil = 0;
let consecutiveEdgeFailures = 0;

function markEdgeSuccess() {
  consecutiveEdgeFailures = 0;
  edgeCooldownUntil = 0;
}

function markEdgeFailure() {
  consecutiveEdgeFailures += 1;
  if (consecutiveEdgeFailures >= 3) {
    edgeCooldownUntil = Date.now() + 15 * 1000;
  }
}

export function mapSpeedToRate(speed) {
  const value = Number.parseFloat(speed);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.4, Math.min(1.5, value));
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

function escapeSsmlText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function synthesizeEdgeSingleSocket(text, voice, speed) {
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 5_000, synthesisTimeoutMs: 9_000 });
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const stream = await tts.toStream(escapeSsmlText(text), {
      rate: mapSpeedToRate(speed),
      pitch: '+0Hz'
    });
    const buffer = await collectStream(stream.audioStream, 9_000);
    if (buffer.byteLength === 0) throw new Error('Empty Edge TTS stream');
    markEdgeSuccess();
    return buffer;
  } finally {
    tts.close();
  }
}

async function synthesizeEdge(text, language, speed, voiceName) {
  const primaryVoice = voiceName || VOICES[language]?.default || VOICES.en.default;

  if (primaryVoice === 'da-DK-ChristelNeural') {
    if (speed <= 0.7 && Date.now() >= edgeCooldownUntil) {
      try {
        const buffer = await synthesizeEdgeSingleSocket(text, primaryVoice, speed);
        return { buffer, source: 'edge', voice: primaryVoice };
      } catch (error) {
        console.warn('[tts] Edge Christel slow failed:', error.message);
      }
    }

    try {
      const audio = await synthesizeBingTranslatorTts(text, primaryVoice, speed, 5_500);
      markEdgeSuccess();
      return { buffer: Buffer.from(audio), source: 'bing-http', voice: primaryVoice };
    } catch (error) {
      console.warn('[tts] Bing HTTP Christel failed:', error.message);
    }

    if (Date.now() < edgeCooldownUntil) return null;
    try {
      const buffer = await synthesizeEdgeSingleSocket(text, 'da-DK-JeppeNeural', speed);
      return { buffer, source: 'edge', voice: 'da-DK-JeppeNeural' };
    } catch (error) {
      console.warn('[tts] Edge fallback Jeppe failed:', error.message);
      markEdgeFailure();
      return null;
    }
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (Date.now() < edgeCooldownUntil) break;
    try {
      const buffer = await synthesizeEdgeSingleSocket(text, primaryVoice, speed);
      return { buffer, source: attempt === 1 ? 'edge' : 'edge-retry', voice: primaryVoice };
    } catch (error) {
      console.warn(`[tts] Edge voice ${primaryVoice} attempt ${attempt} failed:`, error.message);
    }
  }

  try {
    const audio = await synthesizeBingTranslatorTts(text, primaryVoice, speed, 5_500);
    return { buffer: Buffer.from(audio), source: 'bing-http', voice: primaryVoice };
  } catch (error) {
    console.warn(`[tts] Bing HTTP voice ${primaryVoice} failed:`, error.message);
  }

  markEdgeFailure();
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

export async function synthesizeSpeech(text, language = 'da', speed = 1, voiceName = null) {
  const cleanText = text.trim();
  const parsedSpeed = Number.parseFloat(speed);
  const safeSpeed = Number.isFinite(parsedSpeed) ? Math.max(0.4, Math.min(1.5, parsedSpeed)) : 1;
  const voice = resolveVoice(language, voiceName);
  const cacheKey = `${language}:${safeSpeed}:${voice}:${cleanText}`;
  const cached = readCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  const edgeResult = await synthesizeEdge(cleanText, language, safeSpeed, voice);
  let buffer = edgeResult?.buffer ?? null;
  let source = edgeResult?.source ?? 'edge';

  if (!buffer) {
    if (safeSpeed !== 1) {
      throw new Error('Edge TTS is unavailable; refusing audio that would not preserve the requested speed');
    }
    buffer = await synthesizeGoogle(cleanText, language, Math.min(1, safeSpeed));
    source = 'google';
  }

  const result = { buffer, source };
  if (source !== 'bing-http' && source !== 'google') writeCache(cacheKey, result);
  return { ...result, cached: false };
}

export async function synthesizeSpeechStream(text, language = 'da', speed = 1, voiceName = null) {
  const cleanText = text.trim();
  const parsedSpeed = Number.parseFloat(speed);
  const safeSpeed = Number.isFinite(parsedSpeed) ? Math.max(0.4, Math.min(1.5, parsedSpeed)) : 1;
  const voice = resolveVoice(language, voiceName);
  const cacheKey = `${language}:${safeSpeed}:${voice}:${cleanText}`;
  const cached = readCache(cacheKey);
  if (cached) {
    return {
      stream: Readable.from([cached.buffer]),
      source: cached.source,
      cached: true,
      cacheKey
    };
  }

  if (voice !== 'da-DK-ChristelNeural' && Date.now() >= edgeCooldownUntil) {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 5_000, synthesisTimeoutMs: 8_000 });
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = await tts.toStream(escapeSsmlText(cleanText), {
        rate: mapSpeedToRate(safeSpeed),
        pitch: '+0Hz'
      });
      audioStream.once('error', (error) => {
        markEdgeFailure();
        tts.close();
        console.warn(`[tts] Edge voice ${voice} stream failed:`, error.message);
      });
      audioStream.once('end', () => {
        markEdgeSuccess();
        tts.close();
      });
      return { stream: audioStream, source: 'edge', cached: false, cacheKey };
    } catch (error) {
      tts.close();
      console.warn(`[tts] Edge voice ${voice} stream setup failed:`, error.message);
    }
  }

  const synthesized = await synthesizeSpeech(cleanText, language, safeSpeed, voice);
  return {
    stream: Readable.from([synthesized.buffer]),
    source: synthesized.source,
    cached: synthesized.cached,
    cacheKey
  };
}

export async function synthesizeSpeechBatch(text, language = 'da', speeds = [1, 0.7, 0.5], voiceName = null, onVariant) {
  const cleanText = text.trim();
  const voice = resolveVoice(language, voiceName);
  const safeSpeeds = Array.from(
    new Set(
      (Array.isArray(speeds) ? speeds : [1, 0.7, 0.5])
        .map((item) => {
          const val = Number.parseFloat(item);
          return Number.isFinite(val) ? Math.max(0.4, Math.min(1.5, val)) : 1;
        })
        .slice(0, 3)
    )
  );

  const missing = [];
  for (const speed of safeSpeeds) {
    const cacheKey = `${language}:${speed}:${voice}:${cleanText}`;
    const cached = readCache(cacheKey);
    if (cached) {
      await onVariant({ speed, buffer: cached.buffer, source: 'cache' });
    } else {
      missing.push(speed);
    }
  }

  if (missing.length === 0) return [];

  const pending = new Set(missing);
  const emit = async (speed, buffer, source) => {
    pending.delete(speed);
    if (source !== 'bing-http' && source !== 'google') {
      writeCache(`${language}:${speed}:${voice}:${cleanText}`, { buffer, source });
    }
    await onVariant({ speed, buffer, source });
  };

  if (Date.now() >= edgeCooldownUntil) {
    const edgeSpeeds =
      voice === 'da-DK-ChristelNeural' ? [...pending].filter((speed) => speed <= 0.7) : [...pending];
    if (edgeSpeeds.length > 0) {
      const tts = new MsEdgeTTS({ connectionTimeoutMs: 5_000, synthesisTimeoutMs: 9_000 });
      try {
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        await Promise.allSettled(
          edgeSpeeds.map(async (speed) => {
            const { audioStream } = await tts.toStream(escapeSsmlText(cleanText), {
              rate: mapSpeedToRate(speed),
              pitch: '+0Hz'
            });
            const buffer = await collectStream(audioStream, 9_000);
            if (buffer.byteLength > 0) {
              markEdgeSuccess();
              await emit(speed, buffer, 'edge');
            }
          })
        );
      } catch {
        // Missing speeds fall through immediately.
      } finally {
        tts.close();
      }
    }
  }

  if (pending.size > 0) {
    await Promise.allSettled(
      [...pending].map(async (speed) => {
        const res = await synthesizeSpeech(cleanText, language, speed, voice);
        await emit(speed, res.buffer, res.source);
      })
    );
  }

  return [...pending];
}

export function cacheSpeechResult(cacheKey, buffer, source) {
  writeCache(cacheKey, { buffer, source });
}
