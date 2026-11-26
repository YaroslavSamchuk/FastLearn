// language: TypeScript, file: src/hooks/useAudio.ts, target: Web / Mobile Browser
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpeechAudio, isCacheableSpeechAudio } from '../lib/api.ts';
import {
  addDanishPhrasePauses,
  normalizeCustomPlaybackSpeed,
  toSpeechText
} from '../lib/speech.ts';
import { log } from '../lib/logger.ts';
import {
  getCachedSpeech,
  HistoryEntryKind,
  saveCachedSpeech
} from '../lib/translationHistory.ts';
import { getPrefetchedSpeechAudio, loadSpeechAudio } from '../lib/speechAudioCache.ts';

const CACHE_LIMIT = 30;
const audioCache = new Map<string, string>();
let sharedAudioElement: HTMLAudioElement | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudioElement) {
    sharedAudioElement = new Audio();
    sharedAudioElement.preload = 'auto';
  }
  return sharedAudioElement;
}

function rememberUrl(key: string, url: string) {
  audioCache.set(key, url);
  while (audioCache.size > CACHE_LIMIT) {
    const oldestKey = audioCache.keys().next().value;
    if (!oldestKey) break;
    const oldestUrl = audioCache.get(oldestKey);
    audioCache.delete(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

export function useAudio(
  language: 'da' | 'en' = 'da',
  userId = '',
  voice = '',
  onError?: (message: string) => void
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fetchRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  const finish = useCallback((requestId: number) => {
    if (requestRef.current !== requestId) return;
    audioRef.current = null;
    setIsPlaying(false);
    setCurrentSpeed(null);
  }, []);

  const stop = useCallback(() => {
    requestRef.current += 1;
    fetchRef.current?.abort();
    fetchRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    }

    setIsPlaying(false);
    setCurrentSpeed(null);
    log.debug('audio', 'Playback stopped');
  }, []);

  const play = useCallback(
    async (
      text: string,
      speed = 1,
      cacheForHistory = false,
      addPhrasePauses = false,
      overrideVoice?: string,
      cacheTextOverride?: string,
      overrideLanguage?: 'da' | 'en',
      cacheKind?: HistoryEntryKind
    ) => {
      const activeLanguage = overrideLanguage ?? language;
      const speechInput =
        addPhrasePauses && activeLanguage === 'da' ? addDanishPhrasePauses(text) : text;
      const spokenText = toSpeechText(speechInput, activeLanguage);
      if (!spokenText) return;

      stop();
      const requestId = requestRef.current;
      const safeSpeed = normalizeCustomPlaybackSpeed(speed);
      const activeVoice = overrideVoice ?? voice;
      const cacheKey = `${userId}:${activeLanguage}:${activeVoice}:${safeSpeed}:${spokenText}`;
      const historyKeyText = cacheTextOverride ?? (addPhrasePauses ? spokenText : text);

      setIsPlaying(true);
      setCurrentSpeed(safeSpeed);

      log.info('audio', 'Playback requested', {
        language: activeLanguage,
        voice: activeVoice || undefined,
        chars: spokenText.length,
        speed: safeSpeed,
        cached: audioCache.has(cacheKey)
      });

      try {
        let url = audioCache.get(cacheKey);

        if (!url) {
          const prefetched = getPrefetchedSpeechAudio(activeLanguage, spokenText, safeSpeed, activeVoice);
          if (prefetched) {
            url = URL.createObjectURL(prefetched);
            rememberUrl(cacheKey, url);
          }
        }

        if (!url && userId) {
          const readWithBudget = <T,>(promise: Promise<T | null>): Promise<T | null> =>
            Promise.race([
              promise,
              new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 20))
            ]);

          let blob: Blob | null = null;
          try {
            const [primaryBlob, fallbackBlob] = await Promise.all([
              readWithBudget(
                getCachedSpeech(
                  userId,
                  activeLanguage,
                  historyKeyText,
                  safeSpeed,
                  activeVoice,
                  { touch: Boolean(cacheTextOverride || addPhrasePauses) }
                ).catch((error) => {
                  log.warn('audio', 'Could not read persistent speech cache', {
                    error: error instanceof Error ? error.message : String(error)
                  });
                  return null;
                })
              ),
              addPhrasePauses && historyKeyText !== spokenText
                ? readWithBudget(
                    getCachedSpeech(userId, activeLanguage, spokenText, safeSpeed, activeVoice).catch(
                      () => null
                    )
                  )
                : Promise.resolve(null)
            ]);
            blob = primaryBlob ?? fallbackBlob;
          } catch (error) {
            log.warn('audio', 'Could not read persistent speech cache', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
          if (requestRef.current !== requestId) return;
          if (blob) {
            url = URL.createObjectURL(blob);
            rememberUrl(cacheKey, url);
          }
        }

        if (!url) {
          const controller = new AbortController();
          fetchRef.current = controller;
          const downloaded = await loadSpeechAudio(
            activeLanguage,
            spokenText,
            safeSpeed,
            () =>
              fetchSpeechAudio(
                spokenText,
                activeLanguage,
                safeSpeed,
                controller.signal,
                activeVoice || undefined
              ),
            activeVoice
          );
          if (requestRef.current !== requestId) return;
          url = URL.createObjectURL(downloaded);
          rememberUrl(cacheKey, url);

          if (cacheForHistory && userId && isCacheableSpeechAudio(downloaded)) {
            void saveCachedSpeech(
              userId,
              activeLanguage,
              historyKeyText,
              safeSpeed,
              downloaded,
              activeVoice,
              cacheKind ? { kind: cacheKind } : undefined
            ).catch((error: unknown) => {
              log.warn('audio', 'Could not save persistent speech cache', {
                error: error instanceof Error ? error.message : String(error)
              });
            });
          }
        }

        if (requestRef.current !== requestId) return;

        const audio = getSharedAudio();
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.src = url;
        audio.currentTime = 0;
        audioRef.current = audio;
        audio.onended = () => finish(requestId);
        audio.onerror = () => {
          if (requestRef.current !== requestId) return;
          log.warn('audio', 'Audio element could not play the Edge TTS file');
          audioRef.current = null;
          finish(requestId);
          onError?.('Не вдалося відтворити озвучку Edge TTS');
        };

        await audio.play();
      } catch (error) {
        if (requestRef.current !== requestId) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          log.info('audio', 'Browser blocked automatic audio playback; tap speed button to play');
          finish(requestId);
          return;
        }

        log.warn('audio', 'Edge TTS unavailable', {
          error: error instanceof Error ? error.message : String(error)
        });
        finish(requestId);
        onError?.('Озвучка Edge TTS тимчасово недоступна');
      } finally {
        if (fetchRef.current && requestRef.current === requestId) fetchRef.current = null;
      }
    },
    [finish, language, onError, stop, userId, voice]
  );

  useEffect(() => {
    return () => {
      requestRef.current += 1;
      fetchRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return { play, stop, isPlaying, currentSpeed };
}
