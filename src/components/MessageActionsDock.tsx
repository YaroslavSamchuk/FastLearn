// language: TypeScript (React), file: src/components/MessageActionsDock.tsx, target: Web / Mobile Browser
import React, { useState } from 'react';
import { Volume2, Copy, Check, Bookmark, Share2 } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { haptic } from '../utils/haptics.ts';

interface MessageActionsDockProps {
  content: string;
  isUser: boolean;
  isPlaying?: boolean;
  onPlay: (speed?: number) => void;
  onSave?: (text: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const MessageActionsDock: React.FC<MessageActionsDockProps> = ({
  content,
  isUser,
  isPlaying = false,
  onPlay,
  onSave,
  onShowToast
}) => {
  const [copied, setCopied] = useState(false);
  const [speed, setSpeed] = useState<number>(0.85);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.tap();
    navigator.clipboard.writeText(content);
    setCopied(true);
    onShowToast('Повідомлення скопійовано', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.tap();
    const speeds = [0.80, 1.0, 1.20];
    const nextIdx = (speeds.indexOf(speed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setSpeed(nextSpeed);
    onShowToast(`Швидкість аудіо: ${nextSpeed}x`, 'info');
    if (isPlaying) {
      onPlay(nextSpeed);
    }
  };

  const handlePlayAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.tap();
    onPlay(speed);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.tap();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FastLearn Dialogue',
          text: content
        });
      } catch {
        // user cancelled share
      }
    } else {
      handleCopy(e);
    }
  };

  return (
    <div className="flex items-center gap-1 select-none pt-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Audio Playback Button with dynamic visualizer */}
      {!isUser && (
        <div className="flex items-center bg-zinc-100 dark:bg-white/5 border border-zinc-200/80 dark:border-white/5 rounded-full p-0.5 shadow-2xs">
          <button
            onClick={handlePlayAudio}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer ${
              isPlaying
                ? 'bg-amber-400 text-zinc-950 font-semibold shadow-xs'
                : 'text-zinc-600 dark:text-zinc-300 hover:text-amber-500 dark:hover:text-amber-400'
            }`}
            title="Прослухати повідомлення"
            aria-label="Прослухати"
          >
            {isPlaying ? (
              <AudioVisualizer isPlaying={true} barColor="bg-zinc-950" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 stroke-[2]" />
            )}
            <span className="text-[11px] font-sans">{isPlaying ? 'Звучить' : 'Озвучити'}</span>
          </button>

          {/* Speed Selector Pill */}
          <button
            onClick={handleToggleSpeed}
            className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 rounded-full transition-colors cursor-pointer"
            title="Змінити темп вимови"
            aria-label="Темп мовлення"
          >
            {speed}x
          </button>
        </div>
      )}

      {/* Copy Button */}
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all cursor-pointer active:scale-90"
        title="Скопіювати текст"
        aria-label="Скопіювати"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.2]" />
        ) : (
          <Copy className="w-3.5 h-3.5 stroke-[1.8]" />
        )}
      </button>

      {/* Share Button */}
      <button
        onClick={handleShare}
        className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all cursor-pointer active:scale-90"
        title="Поділитися"
        aria-label="Поділитися"
      >
        <Share2 className="w-3.5 h-3.5 stroke-[1.8]" />
      </button>
    </div>
  );
};
