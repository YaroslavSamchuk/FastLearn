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
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} my-1 px-1`}>
      <div
        className={`relative max-w-[85%] sm:max-w-[75%] rounded-lg px-3 py-2 text-sm leading-relaxed transition-all ${
          isUser
            ? 'bg-zinc-800 text-zinc-100 rounded-br-xs border border-white/5'
            : 'bg-[#141418] text-zinc-200 rounded-bl-xs border border-white/10 shadow-sm'
        }`}
      >
        {/* Message Content */}
        <div className="select-text whitespace-pre-wrap break-words text-[14px] sm:text-[15px]">
          {message.content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 bg-amber-400 ml-1 animate-pulse align-middle" />
          )}
        </div>

        {/* Bubble Footer: Timestamp & Audio trigger */}
        <div className="flex items-center justify-end gap-1.5 mt-1 opacity-70">
          {!isUser && (
            <button
              onClick={() => onPlayFull(message.content)}
              title="Прослухати повідомлення"
              className="p-0.5 hover:text-amber-400 text-zinc-400 transition-colors"
            >
              <Volume2 className="w-3 h-3" />
            </button>
          )}
          {timeFormatted && (
            <span className="text-[10px] font-mono text-zinc-400 select-none">
              {timeFormatted}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
