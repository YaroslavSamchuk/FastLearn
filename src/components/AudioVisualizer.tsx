// language: TypeScript (React), file: src/components/AudioVisualizer.tsx, target: Web / Mobile Browser
import React from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
  barColor?: string;
}

const BARS = ['animate-eq-1', 'animate-eq-2', 'animate-eq-3', 'animate-eq-4'];
const IDLE_HEIGHTS = ['h-1.5', 'h-2.5', 'h-1.5', 'h-2'];

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isPlaying,
  className = '',
  barColor = 'bg-amber-500'
}) => {
  return (
    <span
      className={`inline-flex h-4 items-center gap-[2px] ${className}`}
      role="img"
      aria-label={isPlaying ? 'Аудіо відтворюється' : 'Аудіо зупинено'}
    >
      {BARS.map((animation, index) => (
        <span
          key={animation}
          className={`w-[2px] ${barColor} ${
            isPlaying ? animation : `${IDLE_HEIGHTS[index]} opacity-40`
          }`}
        />
      ))}
    </span>
  );
};
