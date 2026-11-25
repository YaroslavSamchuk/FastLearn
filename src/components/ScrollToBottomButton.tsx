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
      className="absolute bottom-4 right-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/[0.14] bg-white text-zinc-700 transition-colors duration-150 hover:border-black/25 hover:bg-zinc-100 focus-visible:outline-none dark:border-white/[0.14] dark:bg-[#141416] dark:text-zinc-300 dark:hover:border-white/25 dark:hover:bg-[#1c1c1f] sm:right-6"
      title="Прокрутити донизу"
      aria-label="Прокрутити до кінця чату"
    >
      <ArrowDown className="h-4 w-4" strokeWidth={1.75} />
      {hasNewMessages && (
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 bg-amber-500"
          aria-hidden="true"
        />
      )}
    </button>
  );
};
