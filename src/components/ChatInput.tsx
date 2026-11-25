// language: TypeScript (React), file: src/components/ChatInput.tsx, target: Web / Mobile Browser
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { Language } from '../types.ts';
import { haptic } from '../utils/haptics.ts';
import { formatResetAt } from '../lib/data.ts';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  language: Language;
  remainingMessages?: number;
  dailyLimit?: number;
  resetAt?: string;
  isLoggedIn?: boolean;
  onLogin?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  language,
  remainingMessages = 30,
  dailyLimit = 30,
  resetAt,
  isLoggedIn = false,
  onLogin
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isLimitReached = remainingMessages <= 0;
  const isInputDisabled = Boolean(disabled) || isLimitReached;

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || isInputDisabled) return;

    haptic.send();
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
  }, [text]);

  const placeholder = isLimitReached
    ? `Ліміт вичерпано · оновлення через ${resetAt ? formatResetAt(resetAt) : 'кілька годин'}`
    : language === 'da'
      ? 'Повідомлення данською чи українською'
      : 'Message in English or Ukrainian';

  if (!isLoggedIn) {
    return (
      <div className="shrink-0 border-t border-black/[0.08] bg-[#f4f4f2] px-4 py-4 pb-safe dark:border-white/[0.08] dark:bg-[#101012] sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => {
              haptic.impact();
              onLogin?.();
            }}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md bg-[#111113] px-5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-[#111113] dark:hover:bg-white"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Увійти через Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-black/[0.08] bg-[#f4f4f2] px-4 py-3 pb-safe dark:border-white/[0.08] dark:bg-[#101012] sm:px-6 sm:py-4">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
        <div
          className={`flex items-end gap-2 rounded-md border bg-white p-2 transition-colors duration-150 dark:bg-[#141416] ${
            isLimitReached
              ? 'border-red-500/45'
              : 'border-black/[0.12] focus-within:border-black/40 dark:border-white/[0.12] dark:focus-within:border-white/35'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isInputDisabled}
            enterKeyHint="send"
            autoComplete="off"
            aria-label="Повідомлення"
            className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[16px] leading-relaxed text-[#111113] placeholder-zinc-400 focus:outline-none disabled:opacity-50 dark:text-zinc-100 dark:placeholder-zinc-500 sm:text-[14px]"
          />

          <div className="flex items-center gap-2.5">
            <span
              className={`font-mono text-[11px] tabular-nums ${
                isLimitReached
                  ? 'text-red-600 dark:text-red-400'
                  : remainingMessages <= 5
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-zinc-500 dark:text-zinc-500'
              }`}
              title={`Залишилось ${remainingMessages} з ${dailyLimit} повідомлень`}
            >
              {remainingMessages}/{dailyLimit}
            </span>

            <button
              type="submit"
              disabled={!text.trim() || isInputDisabled}
              className={`flex h-9 w-9 items-center justify-center rounded-[4px] transition-colors duration-150 ${
                text.trim() && !isInputDisabled
                  ? 'bg-amber-500 text-[#111113] hover:bg-amber-400'
                  : 'cursor-not-allowed bg-black/[0.06] text-zinc-400 dark:bg-white/[0.06] dark:text-zinc-600'
              }`}
              title={isLimitReached ? 'Ліміт вичерпано' : 'Надіслати'}
              aria-label="Надіслати повідомлення"
            >
              {disabled ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <ArrowUp className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
