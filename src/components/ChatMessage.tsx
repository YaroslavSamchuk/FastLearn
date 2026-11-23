import React from 'react';
import { Message } from '../types.ts';
import { Volume2 } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onPlayFull: (text: string) => void;
  isStreaming?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onPlayFull,
  isStreaming
}) => {
  const isUser = message.role === 'user';

  const timeFormatted = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} my-2.5 animate-message-enter`}
    >
      <div
        className={`relative max-w-[92%] sm:max-w-[80%] rounded-lg px-4 py-3 leading-relaxed transition-colors border select-text ${
          isUser
            ? 'bg-zinc-900 text-zinc-100 dark:bg-zinc-800 dark:text-zinc-100 rounded-tr-xs border-zinc-900 dark:border-zinc-700/60 shadow-xs'
            : 'bg-white text-zinc-900 dark:bg-[#121215] dark:text-zinc-200 rounded-tl-xs border-zinc-200 dark:border-zinc-800/80 shadow-xs'
        }`}
      >
        {/* Message Content */}
        <div className="whitespace-pre-wrap break-words text-[15px] sm:text-base leading-relaxed selection:bg-amber-400/30">
          {message.content}
          {isStreaming && (
            <span
              className="inline-block w-1.5 h-4 bg-amber-400 rounded-xs ml-1.5 align-middle animate-subtle-pulse"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Message Footer: Audio trigger & Monospace Timestamp */}
        <div className="flex items-center justify-between gap-3 mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
          {!isUser ? (
            <button
              onClick={() => onPlayFull(message.content)}
              title="Прослухати вимову вголос"
              className="flex items-center gap-1.5 py-0.5 px-1.5 -ml-1 text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400 rounded-xs hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>Озвучити</span>
            </button>
          ) : (
            <div />
          )}

          {timeFormatted && (
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 select-none tabular-numbers">
              {timeFormatted}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
