// language: TypeScript (React), file: src/components/BrandMark.tsx, target: Web / Mobile Browser
import React from 'react';

interface BrandMarkProps {
  className?: string;
  animated?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  className = 'h-4 w-4',
  animated = false
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className={`shrink-0 text-amber-600 dark:text-amber-400 ${className}`}
    aria-hidden="true"
  >
    {animated ? (
      <>
        <path d="M4 7h14" className="animate-brand-line-1" />
        <path d="M4 12h10" className="animate-brand-line-2" />
        <path d="M4 17h6" className="animate-brand-line-3" />
      </>
    ) : (
      <path d="M4 7h14M4 12h10M4 17h6" />
    )}
  </svg>
);
