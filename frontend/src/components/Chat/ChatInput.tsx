import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  loading: boolean;
  level: string;
  model: string;
  hasApiKey: boolean;
  onOpenSettings: () => void;
}

const QUICK_STARTERS = [
  'Hej! Hvordan har du det?',
  'Hvad laver du i dag?',
  'Fortæl mig lidt om København.',
  'Kan du hjælpe mig med at øve dansk?',
];

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  loading,
  level,
  model,
  hasApiKey,
  onOpenSettings,
}) => {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loading && inputRef.current) {
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
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  return (
    <div className="border-t-2 border-black bg-white p-3 brutal-shadow-md">
      {/* Quick starter phrases */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
        <span className="text-[10px] font-mono text-zinc-400 uppercase whitespace-nowrap flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" />
          Підказки:
        </span>
        {QUICK_STARTERS.map((starter, idx) => (
          <button
            key={idx}
            onClick={() => {
              setText(starter);
              if (inputRef.current) inputRef.current.focus();
            }}
            className="text-xs font-sans px-2 py-0.5 bg-zinc-50 hover:bg-zinc-200 border border-black whitespace-nowrap transition-colors"
          >
            {starter}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              hasApiKey
                ? 'Напишіть репліку датською або запитання... (Enter для відправки)'
                : 'Введіть Gemini API ключ для початку діалогу...'
            }
            className="w-full resize-none p-2.5 text-sm bg-zinc-50 border-2 border-black focus:outline-none focus:bg-white placeholder:text-zinc-400 font-sans leading-normal max-h-36"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={loading || !text.trim()}
          className="brutal-btn px-4 py-2.5 bg-black text-white text-sm font-mono flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>ШІ...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Надіслати</span>
            </>
          )}
        </button>
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between mt-2 pt-1 text-[10px] font-mono text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="bg-zinc-100 px-1 border border-zinc-400 text-black font-bold">
            [{level}]
          </span>
          <span className="text-zinc-600">
            {model}
          </span>
        </div>
        <div className="text-zinc-400">
          Shift+Enter: новий рядок • Enter: відправити
        </div>
      </div>
    </div>
  );
};
