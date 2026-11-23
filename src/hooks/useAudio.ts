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
      setIsPlaying(false);
      setCurrentSpeed(null);
    }
  }, []);

  const play = useCallback(async (text: string, speed = 0.80, customVoice?: string) => {
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
        if (!res.ok) throw new Error('Audio synthesis failed');

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
        setIsPlaying(false);
        setCurrentSpeed(null);
      };

      await audio.play();
    } catch (err) {
      console.warn('[Audio Player] Error:', err);
      setIsPlaying(false);
      setCurrentSpeed(null);
    }
  }, [language, voiceName, stop]);

  return { play, stop, isPlaying, currentSpeed };
}
