// language: TypeScript (React), file: src/components/Toast.tsx, target: Web / Mobile Browser
import React from 'react';
import { Check, Info, AlertTriangle } from 'lucide-react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'info' | 'warning';
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-60 flex flex-col items-center gap-2 pointer-events-none select-none w-full max-w-sm px-4"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success' || !toast.type;
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            onClick={() => onDismiss(toast.id)}
            className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-full glass-pill border border-zinc-200/80 dark:border-white/10 text-zinc-900 dark:text-zinc-100 shadow-xl animate-spring-bounce cursor-pointer active:scale-95 transition-transform"
          >
            {isSuccess && (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-zinc-950">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </span>
            )}
            {isWarning && (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white">
                <AlertTriangle className="w-3 h-3 stroke-[2.5]" />
              </span>
            )}
            {!isSuccess && !isWarning && (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                <Info className="w-3.5 h-3.5 stroke-[2.2]" />
              </span>
            )}

            <span className="text-xs sm:text-[13px] font-medium tracking-tight">
              {toast.text}
            </span>
          </div>
        );
      })}
    </div>
  );
};
