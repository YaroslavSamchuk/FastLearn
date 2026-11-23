// language: TypeScript, file: src/hooks/useAudio.ts, target: Web / Mobile Browser
import { useState, useRef, useCallback } from 'react';

const audioCache = new Map<string, string>();

export function useAudio(language: 'da' | 'en' = 'da', voiceName?: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setCurrentSpeed(null);
  }, []);

  const playWithWebSpeech = useCallback(
    (text: string, speed = 0.8) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setIsPlaying(false);
        setCurrentSpeed(null);
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.trim());
      utterance.lang = language === 'da' ? 'da-DK' : 'en-US';
      utterance.rate = Math.max(0.5, Math.min(2.0, speed));
      utterance.pitch = 1.0;

      // Try selecting a natural matching voice if available
      const voices = window.speechSynthesis.getVoices();
      const targetLang = language === 'da' ? 'da' : 'en';
      const matchingVoice = voices.find((v) => v.lang.toLowerCase().startsWith(targetLang));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onend = () => {
        setIsPlaying(false);
        setCurrentSpeed(null);
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setCurrentSpeed(null);
      };

      window.speechSynthesis.speak(utterance);
    },
    [language]
  );

  const play = useCallback(
    async (text: string, speed = 0.8, customVoice?: string) => {
      if (!text?.trim()) return;

      stop();
      setIsPlaying(true);
      setCurrentSpeed(speed);

      const voice = customVoice || voiceName || '';
      const cacheKey = `${language}:${speed}:${voice}:${text.trim()}`;

      try {
        let audioUrl = audioCache.get(cacheKey);

        if (!audioUrl) {
          const query = new URLSearchParams({
            text: text.trim(),
            lang: language,
            speed: speed.toString(),
            ...(voice ? { voice } : {})
          });

          const res = await fetch(`/api/tts?${query.toString()}`);
          const contentType = res.headers.get('content-type') || '';

          // If backend didn't return valid audio, immediately fall back to Web Speech
          if (!res.ok || !contentType.includes('audio')) {
            playWithWebSpeech(text, speed);
            return;
          }

          const blob = await res.blob();
          audioUrl = URL.createObjectURL(blob);
          audioCache.set(cacheKey, audioUrl);
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsPlaying(false);
          setCurrentSpeed(null);
        };

        audio.onerror = () => {
          playWithWebSpeech(text, speed);
        };

        await audio.play();
      } catch (err) {
        // Fallback to high-reliability client Web Speech API
        playWithWebSpeech(text, speed);
      }
    },
    [language, voiceName, stop, playWithWebSpeech]
  );

  return { play, stop, isPlaying, currentSpeed };
}
