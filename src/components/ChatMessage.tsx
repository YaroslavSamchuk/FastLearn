// language: TypeScript (React), file: src/components/ChatMessage.tsx, target: Web / Mobile Browser
import React from 'react';
import { Message } from '../types.ts';
import { MessageActionsDock } from './MessageActionsDock.tsx';
import { SelectableText } from './SelectableText.tsx';

interface ChatMessageProps {
  message: Message;
  onPlayFull: (text: string, speed?: number) => void;
  onStopAudio?: () => void;
  isStreaming?: boolean;
  isPlaying?: boolean;
  playingText?: string;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onPlayFull,
  onStopAudio,
  isStreaming = false,
  isPlaying = false,
  playingText,
  onShowToast
}) => {
  const isUser = message.role === 'user';
  const isCurrentPlaying = !isUser && isPlaying && playingText === message.content;

  const timeFormatted = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex w-full px-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3.5 sm:max-w-[80%] ${
          isUser
            ? 'rounded-br-lg bg-stone-900 text-stone-50 shadow-sm shadow-stone-950/10 dark:bg-stone-100 dark:text-stone-950'
            : 'rounded-bl-lg border border-stone-200/90 bg-white text-stone-900 shadow-sm shadow-stone-900/[0.03] dark:border-white/[0.08] dark:bg-[#191817] dark:text-stone-100'
        }`}
      >
        <div className="text-[15px] leading-6">
          <SelectableText
            text={message.content}
            messageId={message._id ?? `${message.createdAt}-${message.role}`}
            isStreaming={isStreaming}
          />
          {isStreaming && (
            <span
              className="ml-1 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-caret bg-stone-500 dark:bg-stone-400"
              aria-hidden="true"
            />
          )}
        </div>

        {!isStreaming && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <MessageActionsDock
              content={message.content}
              isUser={isUser}
              isPlaying={isCurrentPlaying}
              onPlay={(speed) => onPlayFull(message.content, speed)}
              onStop={onStopAudio}
              onShowToast={onShowToast}
            />

            {timeFormatted && (
              <span
                className={`shrink-0 font-mono text-[11px] tabular-nums ${
                  isUser
                    ? 'text-stone-400 dark:text-stone-500'
                    : 'text-stone-500 dark:text-stone-500'
                }`}
              >
                {timeFormatted}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
