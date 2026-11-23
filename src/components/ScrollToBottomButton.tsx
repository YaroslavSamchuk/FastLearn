// language: TypeScript (React), file: src/components/ScrollToBottomButton.tsx, target: Web / Mobile Browser
import React from 'react';
import { ArrowDown } from 'lucide-react';
import { haptic } from '../utils/haptics.ts';

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
  hasNewMessages?: boolean;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  visible,
  onClick,
  hasNewMessages = false
}) => {
  if (!visible) return null;

  const handleClick = () => {
    haptic.tap();
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className="absolute bottom-4 right-4 sm:right-8 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full glass-pill border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 shadow-lg hover:border-amber-400 dark:hover:border-amber-400/80 active:scale-95 transition-all duration-150 cursor-pointer animate-spring-bounce"
      title="Прокрутити донизу"
      aria-label="Прокрутити до кінця чату"
    >
      <ArrowDown className="w-4 h-4 stroke-[2]" />
      {hasNewMessages && (
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      )}
      <span className="text-xs font-medium tracking-tight pr-0.5">Вниз</span>
    </button>
  );
};
