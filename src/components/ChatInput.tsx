import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, AlertCircle } from 'lucide-react';
import { Language } from '../types.ts';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  language: Language;
  remainingMessages?: number;
  isLoggedIn?: boolean;
  onLogin?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  language,
  remainingMessages = 30,
  isLoggedIn = false,
  onLogin
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isLimitReached = remainingMessages <= 0;
  const isInputDisabled = disabled || isLimitReached;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || isInputDisabled) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [text]);

  const placeholder = isLimitReached
    ? 'Денний ліміт вичерпано. Оновиться пізніше...'
    : 'Напишіть повідомлення... (Enter для надсилання)';

  // Guest view: Clean brutalist sign-in bar
  if (!isLoggedIn) {
    return (
      <div className="border-t border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-[#09090b]/95 p-3 sm:p-4 shrink-0 transition-colors select-none">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-medium text-xs sm:text-sm tracking-tight transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.99]"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
            <span>Увійти через Google для початку розмови</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-[#09090b]/95 p-3 sm:p-4 shrink-0 transition-colors">
      <form
        onSubmit={handleSubmit}
        className={`max-w-3xl mx-auto flex items-end gap-2.5 bg-zinc-50 dark:bg-[#111114] border rounded-lg px-3.5 py-2.5 transition-all shadow-xs ${
          isLimitReached
            ? 'border-red-500/30 bg-red-50/40 dark:bg-red-950/20'
            : 'border-zinc-200 dark:border-zinc-800 focus-within:border-zinc-400 dark:focus-within:border-zinc-600 focus-within:bg-white dark:focus-within:bg-[#131317]'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isInputDisabled}
          className="flex-1 bg-transparent border-0 focus:ring-0 focus:outline-hidden resize-none text-[14px] sm:text-[15px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 max-h-36 py-1 leading-relaxed disabled:opacity-50"
        />

        <div className="flex items-center gap-2 shrink-0 pb-0.5">
          {/* Subtle quota counter */}
          <span className="hidden sm:inline font-mono text-[10px] text-zinc-400 dark:text-zinc-500 tabular-numbers select-none">
            {remainingMessages} лім.
          </span>

          <button
            type="submit"
            disabled={!text.trim() || isInputDisabled}
            className={`p-2 rounded-md transition-all duration-150 cursor-pointer ${
              text.trim() && !isInputDisabled
                ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300 active:scale-95 shadow-xs'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
            }`}
            title={isLimitReached ? 'Ліміт вичерпано' : 'Надіслати (Enter)'}
            aria-label="Надіслати"
          >
            {disabled ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-600 dark:text-zinc-300" />
            ) : isLimitReached ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : (
              <ArrowUp className="w-4 h-4 stroke-[2.2]" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
