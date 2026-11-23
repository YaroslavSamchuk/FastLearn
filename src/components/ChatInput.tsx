import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, AlertCircle } from 'lucide-react';
import { Language } from '../types.ts';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  language: Language;
  remainingMessages?: number;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  language,
  remainingMessages = 30
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
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const placeholder = isLimitReached
    ? 'Денний ліміт вичерпано (0/30). Зачекайте оновлення...'
    : language === 'da'
    ? 'Skriv en besked...'
    : 'Type a message...';

  return (
    <div className="border-t border-white/10 bg-[#09090b]/95 p-2 sm:p-3 shrink-0">
      <form
        onSubmit={handleSubmit}
        className={`max-w-3xl mx-auto flex items-end gap-2 bg-[#141418] border rounded-2xl px-3 py-1.5 transition-colors ${
          isLimitReached
            ? 'border-red-500/30 bg-red-950/10'
            : 'border-white/10 focus-within:border-white/25'
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
          className="flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none resize-none text-[14px] sm:text-[15px] text-zinc-100 placeholder-zinc-500 max-h-32 py-1 leading-relaxed disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!text.trim() || isInputDisabled}
          className={`p-1.5 rounded-full transition-all shrink-0 mb-0.5 ${
            text.trim() && !isInputDisabled
              ? 'bg-amber-400 text-black hover:bg-amber-300 active:scale-95'
              : 'bg-white/5 text-zinc-600 cursor-not-allowed'
          }`}
          title={isLimitReached ? 'Ліміт вичерпано' : 'Send'}
        >
          {disabled ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          ) : isLimitReached ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  );
};
