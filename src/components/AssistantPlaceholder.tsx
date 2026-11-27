// language: TypeScript (React), file: src/components/AssistantPlaceholder.tsx, target: Web / Mobile Browser
import React from 'react';
import { BookOpen, FileText, Globe, Newspaper } from 'lucide-react';
import { BrandMark } from './BrandMark.tsx';
import {
  createInitialWaitingState,
  describeWaitingState,
  type WaitingPhase,
  type WaitingState
} from '../lib/waitingStatus.ts';

export type { WaitingPhase, WaitingState };

interface AssistantPlaceholderProps {
  status?: WaitingState;
  phase?: WaitingPhase;
}

const SKELETON_LINES = [
  { widthClass: 'w-[96%]', delayClass: 'skeleton-delay-0' },
  { widthClass: 'w-[78%]', delayClass: 'skeleton-delay-1' },
  { widthClass: 'w-[52%]', delayClass: 'skeleton-delay-2' }
] as const;

/**
 * Renders a calm, multi-phase assistant turn placeholder reflecting live thinking,
 * web/media/Wikipedia lookup, and result synthesis before tokens stream in.
 */
export const AssistantPlaceholder: React.FC<AssistantPlaceholderProps> = ({
  status,
  phase = 'thinking'
}) => {
  const effectiveState: WaitingState = status ?? {
    ...createInitialWaitingState(),
    phase
  };
  const { label, trail, icon } = describeWaitingState(effectiveState);

  return (
    <div
      className="animate-placeholder-in flex w-full flex-col items-start"
      role="status"
      aria-live="polite"
      aria-label={trail ? `${label}. ${trail}` : label}
    >
      <div className="w-full py-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#57534e] dark:text-[#a8a29a]">
            {icon === 'wiki' ? (
              <BookOpen className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            ) : icon === 'news' ? (
              <Newspaper className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            ) : icon === 'page' ? (
              <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            ) : icon === 'web' ? (
              <Globe className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <BrandMark animated className="h-4 w-4" />
            )}
          </span>

          <span className="text-[13px] font-medium leading-5 text-[#57534e] dark:text-[#a8a29a] tabular-nums">
            {label}
          </span>

          {trail && (
            <span className="font-mono text-[12px] leading-5 text-[#736d65] dark:text-[#8a847c] tabular-nums">
              {trail}
            </span>
          )}
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
