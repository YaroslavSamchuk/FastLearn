// language: TypeScript (React), file: src/components/AssistantPlaceholder.tsx, target: Web / Mobile Browser
import React from 'react';
import { BrandMark } from './BrandMark.tsx';

export type WaitingPhase = 'thinking' | 'memory';

interface AssistantPlaceholderProps {
  phase?: WaitingPhase;
}

const SKELETON_LINES = [
  { widthClass: 'w-[96%]', delayClass: 'skeleton-delay-0' },
  { widthClass: 'w-[78%]', delayClass: 'skeleton-delay-1' },
  { widthClass: 'w-[52%]', delayClass: 'skeleton-delay-2' }
] as const;

/**
 * Renders a calm, structured assistant turn placeholder while waiting for the first streamed token.
 */
export const AssistantPlaceholder: React.FC<AssistantPlaceholderProps> = ({
  phase = 'thinking'
}) => {
  const statusText =
    phase === 'memory' ? 'Пам’ять оновлено · готує відповідь…' : 'Готує відповідь…';

  return (
    <div
      className="animate-placeholder-in flex w-full flex-col items-start"
      role="status"
      aria-live="polite"
      aria-label={statusText}
    >
      <div className="w-full py-0.5 sm:py-1">
        <div className="flex items-center gap-2">
          <BrandMark animated className="h-4 w-4" />
          <span className="text-[13px] font-medium leading-5 text-[#57534e] dark:text-[#a8a29a]">
            {statusText}
          </span>
        </div>

        <div className="mt-3 flex w-full max-w-[540px] flex-col gap-3" aria-hidden="true">
          {SKELETON_LINES.map((line) => (
            <div
              key={line.widthClass}
              className={`relative h-3 ${line.widthClass} overflow-hidden rounded bg-[#e8e5dd] dark:bg-[#24221f]`}
            >
              <span className={`skeleton-sweep ${line.delayClass}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
