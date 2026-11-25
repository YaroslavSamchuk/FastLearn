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
    'text-stone-500 hover:bg-stone-200/60 hover:text-stone-900 dark:text-stone-500 dark:hover:bg-white/[0.06] dark:hover:text-stone-100';

  return (
    <div className="flex items-center gap-1 select-none">
      {!isUser && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handlePlayAudio}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors ${subtleButton} ${
              isPlaying ? 'text-amber-700 dark:text-amber-400' : ''
            }`}
            title={isPlaying ? 'Зупинити відтворення' : `Прослухати зі швидкістю ${speed}x`}
            aria-label={isPlaying ? 'Зупинити відтворення' : 'Прослухати повідомлення'}
          >
            {isPlaying ? (
              <AudioVisualizer isPlaying barColor="bg-amber-600 dark:bg-amber-400" />
            ) : (
              <Volume2 className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleSpeed}
            className="h-7 rounded-md px-1 font-mono text-[11px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-500 dark:hover:bg-white/[0.06] dark:hover:text-stone-200"
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
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${subtleButton}`}
        title="Скопіювати текст"
        aria-label="Скопіювати текст"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
};
