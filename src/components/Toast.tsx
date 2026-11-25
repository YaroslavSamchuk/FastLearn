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
  success: 'text-[#16a34a] dark:text-[#4cc38a]',
  info: 'text-[#736d65] dark:text-[#a8a29a]',
  warning: 'text-[#dc2626] dark:text-[#e5484d]'
} as const;

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[calc(3.5rem+0.75rem+env(safe-area-inset-top,0px))] z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-stretch gap-2 px-4"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const type = toast.type ?? 'success';
        const Icon = ICONS[type];

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-toast-in items-center gap-2.5 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-[#1c1917] shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:bg-[#1c1a18] dark:text-[#efede8] dark:shadow-none"
            role="status"
          >
            <Icon className={`h-4 w-4 shrink-0 ${TONES[type]}`} strokeWidth={1.5} />
            <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
              {toast.text}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-black/[0.05] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:bg-white/[0.06] dark:hover:text-[#efede8]"
              aria-label="Закрити повідомлення"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
