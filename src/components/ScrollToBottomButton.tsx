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

  return (
    <button
      type="button"
      onClick={() => {
        haptic.tap();
        onClick();
      }}
      className="absolute bottom-4 right-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-sm transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 dark:border-white/[0.12] dark:bg-[#1c1917] dark:text-stone-300 dark:hover:bg-[#252019] sm:right-6"
      title="Прокрутити донизу"
      aria-label="Прокрутити до кінця чату"
    >
      <ArrowDown className="h-4 w-4" strokeWidth={2} />
      {hasNewMessages && (
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500"
          aria-hidden="true"
        />
      )}
    </button>
  );
};
