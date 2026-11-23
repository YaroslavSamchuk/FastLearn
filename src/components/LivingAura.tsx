// language: TypeScript (React), file: src/components/LivingAura.tsx, target: Web / Mobile Browser
import React from 'react';

interface LivingAuraProps {
  isStreaming?: boolean;
  isPlaying?: boolean;
}

export const LivingAura: React.FC<LivingAuraProps> = ({ isStreaming = false, isPlaying = false }) => {
  const isActive = isStreaming || isPlaying;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none" aria-hidden="true">
      {/* Top Ambient Glow (Gemini Aura) */}
      <div
        className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[550px] sm:w-[750px] h-[360px] rounded-full blur-[110px] transition-all duration-1000 ease-out ${
          isActive
            ? 'opacity-40 dark:opacity-35 scale-110 bg-gradient-to-r from-amber-500/40 via-yellow-400/30 to-amber-600/40'
            : 'opacity-20 dark:opacity-15 scale-100 bg-gradient-to-r from-amber-500/25 via-zinc-400/10 to-amber-600/20'
        }`}
      />

      {/* Floating Bottom Left Subtle Radial Tint */}
      <div
        className={`absolute -bottom-40 -left-20 w-[400px] h-[350px] rounded-full blur-[120px] transition-all duration-1000 ease-out ${
          isActive
            ? 'opacity-25 dark:opacity-20 scale-105 bg-amber-400/30'
            : 'opacity-10 dark:opacity-05 scale-100 bg-amber-400/15'
        }`}
      />

      {/* Floating Bottom Right Subtle Radial Tint */}
      <div
        className={`absolute -bottom-40 -right-20 w-[420px] h-[350px] rounded-full blur-[130px] transition-all duration-1000 ease-out ${
          isActive
            ? 'opacity-25 dark:opacity-20 scale-105 bg-yellow-500/25'
            : 'opacity-10 dark:opacity-05 scale-100 bg-yellow-500/15'
        }`}
      />
    </div>
  );
};
