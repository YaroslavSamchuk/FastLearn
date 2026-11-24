// language: TypeScript (React), file: src/components/UserAvatar.tsx, target: Web

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
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200 ${className}`}
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
        <span className="text-[11px] font-semibold">{initials(name)}</span>
      )}
    </span>
  );
};
