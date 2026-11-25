// language: TypeScript (React), file: src/components/UserAvatar.tsx, target: Web
import React, { useEffect, useState } from 'react';

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

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.08] bg-[#eceae4] text-[#1c1917] dark:border-white/[0.08] dark:bg-[#262421] dark:text-[#efede8] ${className}`}
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
        <span className="font-mono text-[12px] font-medium tabular-nums">{initials(name)}</span>
      )}
    </span>
  );
};
