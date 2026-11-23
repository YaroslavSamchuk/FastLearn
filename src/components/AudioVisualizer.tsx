// language: TypeScript (React), file: src/components/AudioVisualizer.tsx, target: Web / Mobile Browser
import React from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
  barColor?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isPlaying,
  className = '',
  barColor = 'bg-amber-400'
}) => {
  if (!isPlaying) {
    return (
      <div className={`flex items-center gap-[2.5px] h-4 px-1 ${className}`} aria-hidden="true">
        <span className={`w-[2.5px] h-1.5 rounded-full ${barColor} opacity-40 transition-all`} />
        <span className={`w-[2.5px] h-2.5 rounded-full ${barColor} opacity-40 transition-all`} />
        <span className={`w-[2.5px] h-1.5 rounded-full ${barColor} opacity-40 transition-all`} />
        <span className={`w-[2.5px] h-2 rounded-full ${barColor} opacity-40 transition-all`} />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-[2.5px] h-4 px-1 ${className}`}
      title="Відтворюється озвучення"
      aria-label="Аудіо відтворюється"
    >
      <span className={`w-[2.5px] rounded-full ${barColor} animate-eq-1 shadow-[0_0_8px_rgba(234,179,8,0.6)]`} />
      <span className={`w-[2.5px] rounded-full ${barColor} animate-eq-2 shadow-[0_0_8px_rgba(234,179,8,0.6)]`} />
      <span className={`w-[2.5px] rounded-full ${barColor} animate-eq-3 shadow-[0_0_8px_rgba(234,179,8,0.6)]`} />
      <span className={`w-[2.5px] rounded-full ${barColor} animate-eq-4 shadow-[0_0_8px_rgba(234,179,8,0.6)]`} />
    </div>
  );
};
