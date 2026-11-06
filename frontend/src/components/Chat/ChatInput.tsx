import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  loading: boolean;
  level: string;
  model: string;
  hasApiKey: boolean;
  onOpenSettings: () => void;
}

const QUICK_STARTERS = [
  'Hej! Hvordan går det?',
  'Hvad laver du i dag?',
  'Fortæl mig om København',
  'Kan du rette mine fejl?',
];

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  loading,
  hasApiKey,
  onOpenSettings,
}) => {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loading && inputRef.current && window.innerWidth > 640) {
      inputRef.current.focus();
    }
  }, [loading]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    if (!hasApiKey) {
      onOpenSettings();
      return;
    }

    onSendMessage(trimmed);
    setText('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <div className="w-full bg-white/95 backdrop-blur-md border-t border-stone-200/90 pt-2 pb-safe px-3 sm:px-4">
      <div className="max-w-2xl mx-auto">
        {/* Quick starter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
          {QUICK_STARTERS.map((starter, idx) => (
            <button
              key={idx}
              onClick={() => {
                setText(starter);
                if (inputRef.current) inputRef.current.focus();
              }}
              className="text-xs px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-full whitespace-nowrap transition-colors shrink-0"
            >
              {starter}
            </button>
          ))}
        </div>

        {/* Input box */}
        <div className="flex items-end gap-2 bg-stone-50 border border-stone-300 rounded-2xl p-1.5 focus-within:border-stone-900 focus-within:bg-white transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              hasApiKey
                ? 'Напишіть датською...'
                : 'Введіть Gemini ключ для бесіди...'
            }
            className="flex-1 resize-none px-2.5 py-1.5 text-sm bg-transparent focus:outline-none placeholder:text-stone-400 font-sans leading-relaxed max-h-32"
          />

          <button
            onClick={handleSend}
            disabled={loading || !text.trim()}
            className="w-8 h-8 rounded-full bg-stone-900 text-white flex items-center justify-center transition-opacity disabled:opacity-30 disabled:cursor-not-allowed shrink-0 cursor-pointer"
            aria-label="Надіслати"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
