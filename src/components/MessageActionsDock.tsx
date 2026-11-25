// language: TypeScript (React), file: src/components/MessageActionsDock.tsx, target: Web / Mobile Browser
import React, { useState } from 'react';
import { Volume2, Copy, Check } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { haptic } from '../utils/haptics.ts';
import { log } from '../lib/logger.ts';
import { SPEECH_PLAYBACK_SPEEDS } from '../lib/speech.ts';

interface MessageActionsDockProps {
  content: string;
  isUser: boolean;
  isPlaying?: boolean;
  speed: number;
  speeds?: readonly number[];
  onPlay: (speed?: number) => void;
  onStop?: () => void;
  onSpeedChange: (speed: number) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const MessageActionsDock: React.FC<MessageActionsDockProps> = ({
  content,
  isUser,
  isPlaying = false,
  speed,
  speeds = SPEECH_PLAYBACK_SPEEDS,
  onPlay,
  onStop,
  onSpeedChange,
  onShowToast
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    haptic.tap();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onShowToast('Скопійовано', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      log.error('clipboard', 'Could not copy a message', {
        error: error instanceof Error ? error.message : String(error)
      });
      onShowToast('Браузер не дав скопіювати текст', 'warning');
    }
  };

  const handleToggleSpeed = () => {
    haptic.tap();
    const cycle = Array.from(new Set(speeds.length > 0 ? speeds : SPEECH_PLAYBACK_SPEEDS));
    const currentIndex = cycle.findIndex((candidate) => candidate === speed);
    const nextSpeed = cycle[(currentIndex + 1) % cycle.length] ?? cycle[0] ?? 1;
    onSpeedChange(nextSpeed);
    log.debug('audio', 'Playback speed changed', { speed: nextSpeed });
  };

  const handlePlayAudio = () => {
    haptic.tap();
    if (isPlaying && onStop) {
      onStop();
      return;
    }
    onPlay(speed);
  };

  const subtleButton =
    'text-[#736d65] hover:bg-black/[0.05] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:bg-white/[0.06] dark:hover:text-[#efede8]';

  return (
    <div className="flex items-center gap-1 select-none">
      {!isUser && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePlayAudio}
            className={`inline-flex h-9 min-w-[36px] items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] transition-[background-color,color,transform] duration-150 ease-unslop active:scale-[0.97] sm:h-8 sm:min-w-[32px] ${subtleButton} ${
              isPlaying ? 'text-amber-700 dark:text-amber-400' : ''
            }`}
            title={isPlaying ? 'Зупинити відтворення' : `Прослухати зі швидкістю ${speed}×`}
            aria-label={isPlaying ? 'Зупинити відтворення' : 'Прослухати повідомлення'}
          >
            {isPlaying ? (
              <AudioVisualizer isPlaying barColor="bg-amber-600 dark:bg-amber-400" />
            ) : (
              <Volume2 className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleSpeed}
            className={`inline-flex h-9 items-center justify-center rounded-lg px-2 font-mono text-[12px] tabular-nums transition-[background-color,color,transform] duration-150 ease-unslop active:scale-[0.97] sm:h-8 ${subtleButton}`}
            title="Змінити темп мовлення"
            aria-label={`Темп мовлення ${speed}×. Натисніть, щоб змінити`}
          >
            {speed}×
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleCopy}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 ease-unslop active:scale-[0.97] sm:h-8 sm:w-8 ${subtleButton}`}
        title="Копіювати текст"
        aria-label="Копіювати текст"
      >
        {copied ? (
          <Check className="h-4 w-4 text-[#16a34a] dark:text-[#4cc38a]" strokeWidth={1.5} />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
};
