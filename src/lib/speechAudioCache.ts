type SpeechLanguage = 'da' | 'en';

const CACHE_LIMIT = 30;
const audioCache = new Map<string, Blob>();
const pendingAudio = new Map<string, Promise<Blob>>();

function makeKey(language: SpeechLanguage, text: string, speed: number): string {
  return `${language}:${speed}:${text}`;
}

export function getPrefetchedSpeechAudio(
  language: SpeechLanguage,
  text: string,
  speed: number
): Blob | null {
  const key = makeKey(language, text, speed);
  const audio = audioCache.get(key);
  if (!audio) return null;

  audioCache.delete(key);
  audioCache.set(key, audio);
  return audio;
}

export function loadSpeechAudio(
  language: SpeechLanguage,
  text: string,
  speed: number,
  load: () => Promise<Blob>
): Promise<Blob> {
  const key = makeKey(language, text, speed);
  const cached = getPrefetchedSpeechAudio(language, text, speed);
  if (cached) return Promise.resolve(cached);

  const pending = pendingAudio.get(key);
  if (pending) return pending;

  const request = load()
    .then((audio) => {
      audioCache.set(key, audio);
      while (audioCache.size > CACHE_LIMIT) {
        const oldestKey = audioCache.keys().next().value;
        if (!oldestKey) break;
        audioCache.delete(oldestKey);
      }
      return audio;
    })
    .finally(() => {
      if (pendingAudio.get(key) === request) pendingAudio.delete(key);
    });

  pendingAudio.set(key, request);
  return request;
}
