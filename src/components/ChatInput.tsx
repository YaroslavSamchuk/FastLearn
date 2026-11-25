// language: TypeScript (React), file: src/components/ChatInput.tsx, target: Web / Mobile Browser
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Language } from '../types.ts';
import { haptic } from '../utils/haptics.ts';
import { formatResetAt } from '../lib/data.ts';

interface ChatInputProps {
  onSend: (text: string) => void;
  onAbort?: () => void;
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
  onAbort,
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

  const isSending = Boolean(disabled);
  const isLimitReached = remainingMessages <= 0;
  const isInputBlocked = isSending || isLimitReached;

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || isInputBlocked) return;

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
    ? `Ліміт вичерпано · через ${resetAt ? formatResetAt(resetAt) : 'кілька годин'}`
    : language === 'da'
      ? 'Повідомлення данською чи українською'
      : 'Message in English or Ukrainian';

  if (!isLoggedIn) {
    return (
      <div className="pb-safe shrink-0 border-t border-black/[0.08] bg-[#f6f5f1] px-4 pt-4 dark:border-white/[0.08] dark:bg-[#121110] sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => {
              haptic.impact();
              onLogin?.();
            }}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg bg-[#1c1917] px-5 text-[14px] font-medium text-[#f6f5f1] transition-[background-color,transform] duration-150 ease-unslop hover:bg-[#342e2a] active:scale-[0.98] dark:bg-[#efede8] dark:text-[#161513] dark:hover:bg-white"
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
    <div className="pb-safe shrink-0 border-t border-black/[0.08] bg-[#f6f5f1] px-4 pt-3 dark:border-white/[0.08] dark:bg-[#121110] sm:px-6 sm:pt-4">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
        <div
          className={`flex items-end gap-2 rounded-xl border bg-white p-1.5 transition-colors duration-150 ease-unslop dark:bg-[#1c1a18] sm:p-2 ${
            isLimitReached
              ? 'border-[#dc2626]/45 dark:border-[#e5484d]/45'
              : 'border-black/[0.1] focus-within:border-black/30 dark:border-white/[0.1] dark:focus-within:border-white/30'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isLimitReached}
            readOnly={isSending}
            enterKeyHint="send"
            autoComplete="off"
            aria-label="Повідомлення"
            className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2.5 py-2 text-[16px] leading-snug text-[#1c1917] placeholder-[#736d65] focus:outline-none disabled:opacity-50 dark:text-[#efede8] dark:placeholder-[#8a847c] sm:min-h-9 sm:py-1.5 sm:text-[14px]"
          />

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`font-mono text-[12px] tabular-nums ${
                isLimitReached
                  ? 'text-[#dc2626] dark:text-[#e5484d]'
                  : remainingMessages <= 5
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-[#736d65] dark:text-[#8a847c]'
              }`}
              title={`Залишилось ${remainingMessages} з ${dailyLimit} повідомлень`}
            >
              {remainingMessages}/{dailyLimit}
            </span>

            {isSending && onAbort ? (
              <button
                type="button"
                onClick={() => {
                  haptic.tap();
                  onAbort();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eceae4] text-[#1c1917] transition-[background-color,transform] duration-150 ease-unslop hover:bg-black/[0.12] active:scale-[0.97] dark:bg-[#262421] dark:text-[#efede8] dark:hover:bg-white/[0.14] sm:h-9 sm:w-9"
                title="Зупинити відповідь"
                aria-label="Зупинити відповідь"
              >
                <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.5} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!text.trim() || isInputBlocked}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 ease-unslop sm:h-9 sm:w-9 ${
                  text.trim() && !isInputBlocked
                    ? 'bg-amber-500 text-[#1c1917] hover:bg-amber-400 active:scale-[0.97]'
                    : 'cursor-not-allowed bg-black/[0.06] text-[#736d65] dark:bg-white/[0.06] dark:text-[#8a847c]'
                }`}
                title={isLimitReached ? 'Ліміт вичерпано' : 'Надіслати'}
                aria-label="Надіслати повідомлення"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
