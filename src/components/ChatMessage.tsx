// language: TypeScript (React), file: src/components/ChatMessage.tsx, target: Web / Mobile Browser
import React from 'react';
import { Message } from '../types.ts';
import { Sparkles, User as UserIcon } from 'lucide-react';
import { MessageActionsDock } from './MessageActionsDock.tsx';

interface ChatMessageProps {
  message: Message;
  onPlayFull: (text: string, speed?: number) => void;
  isStreaming?: boolean;
  isPlaying?: boolean;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onPlayFull,
  isStreaming = false,
  isPlaying = false,
  onShowToast
}) => {
  const isUser = message.role === 'user';

  const timeFormatted = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} my-3 animate-message-enter select-text`}
    >
      <div className={`flex gap-2.5 max-w-[94%] sm:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar indicator (Gemini Sparkle for AI, minimal pill for User) */}
        {!isUser ? (
          <div className="shrink-0 mt-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500/20 to-yellow-400/20 border border-amber-400/30 flex items-center justify-center text-amber-500 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 animate-gemini-glow" />
            </div>
          </div>
        ) : (
          <div className="shrink-0 mt-1 hidden sm:block">
            <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400">
              <UserIcon className="w-3.5 h-3.5 stroke-[2]" />
            </div>
          </div>
        )}

        {/* Message Bubble Body */}
        <div
          className={`relative rounded-2xl px-4 py-3 leading-relaxed transition-all ${
            isUser
              ? 'bg-zinc-900 text-zinc-50 dark:bg-white dark:text-zinc-950 rounded-tr-xs shadow-md border border-zinc-900 dark:border-white/20'
              : 'bg-white text-zinc-900 dark:bg-[#131317] dark:text-zinc-100 rounded-tl-xs shadow-xs border border-zinc-200/90 dark:border-white/5'
          }`}
        >
          {/* Content */}
          <div className="whitespace-pre-wrap break-words text-[14.5px] sm:text-[15.5px] leading-relaxed tracking-tight">
            {message.content}
            {isStreaming && (
              <span
                className="inline-block w-2 h-4.5 bg-amber-400 rounded-xs ml-1.5 align-middle animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.8)]"
                aria-hidden="true"
              />
            )}
          </div>

          {/* Message Footer Dock: Timestamp & Mobile Actions */}
          <div className="flex items-center justify-between gap-3 mt-2 pt-1.5 border-t border-zinc-100 dark:border-white/5">
            <MessageActionsDock
              content={message.content}
              isUser={isUser}
              isPlaying={isPlaying}
              onPlay={(speed) => onPlayFull(message.content, speed)}
              onShowToast={onShowToast}
            />

            {timeFormatted && (
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 select-none tabular-numbers shrink-0">
                {timeFormatted}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
