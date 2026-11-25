// language: TypeScript (React), file: src/components/Toast.tsx, target: Web / Mobile Browser
import React from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'info' | 'warning';
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const ICONS = {
  success: Check,
  info: Info,
  warning: AlertTriangle
} as const;

const TONES = {
  success: 'text-emerald-700 dark:text-emerald-400',
  info: 'text-zinc-500 dark:text-zinc-400',
  warning: 'text-red-600 dark:text-red-400'
} as const;

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-4 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-stretch gap-2 px-4 sm:top-5"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const type = toast.type ?? 'success';
        const Icon = ICONS[type];

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-toast-in items-start gap-2.5 rounded-md border border-black/[0.14] bg-white px-3 py-2.5 text-[#111113] dark:border-white/[0.14] dark:bg-[#141416] dark:text-zinc-100"
            role="status"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONES[type]}`} strokeWidth={1.75} />
            <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
              {toast.text}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="-mr-1 -mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-zinc-400 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200"
              aria-label="Закрити повідомлення"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
