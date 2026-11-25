// language: TypeScript, file: src/components/UserAvatar.tsx, target: Web

import React, { useState } from 'react';

interface UserAvatarProps {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, src, size = 36, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-black/[0.1] bg-zinc-200 text-zinc-800 dark:border-white/[0.12] dark:bg-zinc-800 dark:text-zinc-200 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <span className="font-mono text-[11px] font-medium tabular-nums">{initials(name)}</span>
      )}
    </span>
  );
};
