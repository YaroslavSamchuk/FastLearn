// language: TypeScript (React), file: src/components/QuotaRing.tsx, target: Web / Mobile Browser
import React from 'react';

interface QuotaRingProps {
  remaining: number;
  total?: number;
  className?: string;
}

export const QuotaRing: React.FC<QuotaRingProps> = ({ remaining, total = 30, className = '' }) => {
  const percentage = Math.max(0, Math.min(100, (remaining / total) * 100));
  const strokeDashoffset = 100 - percentage;

  const colorClass =
    remaining > 10
      ? 'text-amber-400 stroke-amber-400'
      : remaining > 3
      ? 'text-yellow-500 stroke-yellow-500'
      : 'text-red-500 stroke-red-500';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-100 dark:bg-white/5 border border-zinc-200/80 dark:border-white/5 select-none ${className}`}
      title={`Залишилось повідомлень: ${remaining} з ${total}`}
    >
      <svg className="w-3.5 h-3.5 -rotate-90" viewBox="0 0 36 36">
        <path
          className="text-zinc-200 dark:text-zinc-800"
          strokeWidth="3.5"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className={`${colorClass} transition-all duration-500 ease-out`}
          strokeDasharray="100, 100"
          strokeDashoffset={strokeDashoffset}
          strokeWidth="3.5"
          strokeLinecap="round"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <span className="font-mono text-[11px] font-medium text-zinc-600 dark:text-zinc-300 tabular-numbers">
        {remaining}
      </span>
    </div>
  );
};
