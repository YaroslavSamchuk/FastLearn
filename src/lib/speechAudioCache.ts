type SpeechLanguage = 'da' | 'en';

const CACHE_LIMIT = 30;
const audioCache = new Map<string, Blob>();
const pendingAudio = new Map<string, Promise<Blob>>();

function makeKey(language: SpeechLanguage, text: string, speed: number): string {
  return `${language}:${speed}:${text}`;
}

function rememberAudio(key: string, audio: Blob): void {
  audioCache.set(key, audio);
  while (audioCache.size > CACHE_LIMIT) {
    const oldestKey = audioCache.keys().next().value;
    if (!oldestKey) break;
    audioCache.delete(oldestKey);
  }
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

export function seedPrefetchedSpeechAudio(
  language: SpeechLanguage,
  text: string,
  speed: number,
  audio: Blob
): void {
  rememberAudio(makeKey(language, text, speed), audio);
}

export async function loadSpeechAudioVariants(
  language: SpeechLanguage,
  text: string,
  speeds: readonly number[],
  load: (speed: number) => Promise<Blob>,
  callbacks?: {
    onSpeedReady?: (speed: number, audio: Blob) => void;
    onSpeedError?: (speed: number, error: unknown) => void;
  }
): Promise<Blob[]> {
  return Promise.all(
    speeds.map((speed) =>
      loadSpeechAudio(language, text, speed, () => load(speed))
        .then((audio) => {
          callbacks?.onSpeedReady?.(speed, audio);
          return audio;
        })
        .catch((error: unknown) => {
          callbacks?.onSpeedError?.(speed, error);
          throw error;
        })
    )
  );
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
      rememberAudio(key, audio);
      return audio;
    })
    .finally(() => {
      if (pendingAudio.get(key) === request) pendingAudio.delete(key);
    });

  pendingAudio.set(key, request);
  return request;
}
