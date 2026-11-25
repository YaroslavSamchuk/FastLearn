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
            ? 'max-w-[85%] rounded-md border border-black/[0.1] bg-white px-4 py-2.5 text-[#111113] dark:border-white/[0.1] dark:bg-[#141416] dark:text-zinc-100 sm:max-w-[72%]'
            : 'w-full py-1 text-[#111113] dark:text-zinc-100'
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
          className={`mt-1.5 flex items-center gap-2 ${
            isUser
              ? 'justify-end opacity-80 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
              : 'w-full justify-between'
          }`}
        >
          <div className={isUser ? '' : '-ml-1'}>
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
          </div>

          {timeFormatted && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
              {timeFormatted}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
