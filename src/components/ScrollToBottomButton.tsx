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
      className="absolute bottom-4 right-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-black/[0.1] bg-white text-[#57534e] shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-[background-color,border-color,color,transform] duration-150 ease-unslop hover:border-black/20 hover:bg-[#eceae4] hover:text-[#1c1917] active:scale-[0.97] focus-visible:outline-none dark:border-white/[0.1] dark:bg-[#1c1a18] dark:text-[#a8a29a] dark:shadow-none dark:hover:border-white/20 dark:hover:bg-[#262421] dark:hover:text-[#efede8] sm:right-6 sm:h-9 sm:w-9"
      title="Прокрутити донизу"
      aria-label="Прокрутити до кінця чату"
    >
      <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
      {hasNewMessages && (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-500"
          aria-hidden="true"
        />
      )}
    </button>
  );
};
