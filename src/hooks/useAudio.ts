// language: TypeScript, file: src/hooks/useAudio.ts, target: Web / Mobile Browser
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpeechAudio } from '../lib/api.ts';
import { toSpeechText } from '../lib/speech.ts';
import { log } from '../lib/logger.ts';
import { getCachedSpeech, saveCachedSpeech } from '../lib/translationHistory.ts';

const CACHE_LIMIT = 30;
const audioCache = new Map<string, string>();

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

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 0.80;
  return Math.max(0.5, Math.min(1.4, speed));
}

export function useAudio(language: 'da' | 'en' = 'da', userId = '') {
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

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsPlaying(false);
    setCurrentSpeed(null);
    log.debug('audio', 'Playback stopped');
  }, []);

  const playWithWebSpeech = useCallback(
    (text: string, speed: number, requestId: number) => {
      if (requestRef.current !== requestId) return;

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        log.warn('audio', 'Web Speech API is unavailable');
        finish(requestId);
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'da' ? 'da-DK' : 'en-US';
      utterance.rate = Math.max(0.5, Math.min(2, speed));
      utterance.pitch = 1;

      const targetPrefix = language === 'da' ? 'da' : 'en';
      const matchingVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLowerCase().startsWith(targetPrefix));
      if (matchingVoice) utterance.voice = matchingVoice;

      utterance.onend = () => finish(requestId);
      utterance.onerror = (event) => {
        if (requestRef.current !== requestId) return;
        log.warn('audio', 'Web Speech playback failed', { error: event.error });
        finish(requestId);
      };

      setIsPlaying(true);
      setCurrentSpeed(speed);
      window.speechSynthesis.speak(utterance);
      log.info('audio', 'Fallback playback started', {
        language,
        chars: text.length,
        voice: matchingVoice?.name ?? 'browser default'
      });
    },
    [finish, language]
  );

  const play = useCallback(
    async (text: string, speed = 0.80, cacheForHistory = false) => {
      const spokenText = toSpeechText(text);
      if (!spokenText) return;

      stop();
      const requestId = requestRef.current;
      const safeSpeed = clampSpeed(speed);
      const cacheKey = `${userId}:${language}:${safeSpeed}:${spokenText}`;

      setIsPlaying(true);
      setCurrentSpeed(safeSpeed);

      log.info('audio', 'Playback requested', {
        language,
        chars: spokenText.length,
        speed: safeSpeed,
        cached: audioCache.has(cacheKey)
      });

      try {
        let url = audioCache.get(cacheKey);

        if (!url) {
          const controller = new AbortController();
          fetchRef.current = controller;
          const startedAt = performance.now();
          let blob: Blob | null = null;
          if (userId) {
            try {
              blob = await getCachedSpeech(userId, language, text, safeSpeed);
            } catch (error) {
              log.warn('audio', 'Could not read persistent speech cache', {
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          if (!blob) {
            blob = await fetchSpeechAudio(spokenText, language, safeSpeed, controller.signal);
            if (cacheForHistory && userId) {
              void saveCachedSpeech(userId, language, text, safeSpeed, blob).catch((error: unknown) => {
                log.warn('audio', 'Could not save persistent speech cache', {
                  error: error instanceof Error ? error.message : String(error)
                });
              });
            }
          }

          url = URL.createObjectURL(blob);
          rememberUrl(cacheKey, url);
          log.info('audio', 'TTS audio downloaded', {
            ms: Math.round(performance.now() - startedAt),
            bytes: blob.size
          });
        }

        if (requestRef.current !== requestId) return;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => finish(requestId);
        audio.onerror = () => {
          if (requestRef.current !== requestId) return;
          log.warn('audio', 'Audio element could not play the TTS file, falling back');
          audioRef.current = null;
          playWithWebSpeech(spokenText, safeSpeed, requestId);
        };

        await audio.play();
      } catch (error) {
        if (requestRef.current !== requestId) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;

        log.warn('audio', 'TTS proxy unavailable, using Web Speech', {
          error: error instanceof Error ? error.message : String(error)
        });
        playWithWebSpeech(spokenText, safeSpeed, requestId);
      } finally {
        if (fetchRef.current && requestRef.current === requestId) fetchRef.current = null;
      }
    },
    [finish, language, playWithWebSpeech, stop, userId]
  );

  useEffect(() => {
    return () => {
      requestRef.current += 1;
      fetchRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { play, stop, isPlaying, currentSpeed };
}
