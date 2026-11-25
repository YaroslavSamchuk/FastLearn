// language: TypeScript (React), file: src/components/ChatMessage.tsx, target: Web / Mobile Browser
import React from 'react';
import { Message } from '../types.ts';
import { MessageActionsDock } from './MessageActionsDock.tsx';
import { SelectableText } from './SelectableText.tsx';

interface ChatMessageProps {
  message: Message;
  onPlayFull: (text: string, speed?: number) => void;
  playbackSpeed?: number;
  playbackSpeeds?: readonly number[];
  onPlaybackSpeedChange?: (speed: number) => void;
  onStopAudio?: () => void;
  isStreaming?: boolean;
  isPlaying?: boolean;
  playingText?: string;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onPlayFull,
  playbackSpeed = 1,
  playbackSpeeds,
  onPlaybackSpeedChange = () => {},
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
    <div className={`group flex w-full flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[#1c1917] dark:border-white/[0.08] dark:bg-[#1c1a18] dark:text-[#efede8] sm:max-w-[72%]'
            : 'w-full py-1 text-[#1c1917] dark:text-[#efede8]'
        }
      >
        <div className={isUser ? 'text-[15px] leading-[1.6]' : 'text-[15px] leading-[1.7]'}>
          <SelectableText
            text={message.content}
            messageId={message._id ?? `${message.createdAt}-${message.role}`}
            isStreaming={isStreaming}
          />
          {isStreaming && (
            <span
              className="ml-1 inline-block h-[1em] w-[7px] translate-y-[2px] animate-caret bg-amber-500"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {!isStreaming && (
        <div
          className={`mt-2 flex items-center gap-2 ${
            isUser
              ? 'justify-end opacity-80 transition-opacity duration-150 ease-unslop sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
              : 'w-full justify-between'
          }`}
        >
          <MessageActionsDock
            content={message.content}
            isUser={isUser}
            isPlaying={isCurrentPlaying}
            speed={playbackSpeed}
            speeds={playbackSpeeds}
            onPlay={(speed) => onPlayFull(message.content, speed)}
            onStop={onStopAudio}
            onSpeedChange={onPlaybackSpeedChange}
            onShowToast={onShowToast}
          />

          {timeFormatted && (
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-[#736d65] dark:text-[#8a847c]">
              {timeFormatted}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
