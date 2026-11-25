// language: TypeScript (React), file: src/components/ChatStream.tsx, target: Web / Mobile Browser
import React, { useEffect, useRef, useState } from 'react';
import { Message, Language } from '../types.ts';
import { BrandMark } from './BrandMark.tsx';
import { ChatMessage } from './ChatMessage.tsx';
import { ScrollToBottomButton } from './ScrollToBottomButton.tsx';
import { haptic } from '../utils/haptics.ts';

interface ChatStreamProps {
  messages: Message[];
  language: Language;
  onPlayFull: (text: string, speed?: number) => void;
  playbackSpeed: number;
  playbackSpeeds?: readonly number[];
  onPlaybackSpeedChange: (speed: number) => void;
  onStopAudio: () => void;
  streamingContent?: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isPlaying?: boolean;
  playingText?: string;
  chatId?: string;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  language,
  onPlayFull,
  playbackSpeed,
  playbackSpeeds,
  onPlaybackSpeedChange,
  onStopAudio,
  streamingContent,
  containerRef,
  isPlaying = false,
  playingText,
  chatId,
  onShowToast
}) => {
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  useEffect(() => {
    nearBottomRef.current = true;
    setShowScrollBottom(false);
    scrollEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [chatId, language]);

  useEffect(() => {
    if (!nearBottomRef.current) return;
    scrollEndRef.current?.scrollIntoView({
      behavior: streamingContent ? 'auto' : 'smooth',
      block: 'end'
    });
  }, [messages, streamingContent]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    nearBottomRef.current = distanceToBottom < 80;
    setShowScrollBottom(distanceToBottom > 240);
  };

  const scrollToBottom = () => {
    haptic.tap();
    nearBottomRef.current = true;
    setShowScrollBottom(false);
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 select-text sm:px-6 sm:py-6"
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
          {messages.length === 0 && !streamingContent ? (
            <div className="my-auto flex flex-col items-center px-4 py-8 text-center">
              <BrandMark className="h-7 w-7 sm:h-8 sm:w-8" />
              <p className="mt-3.5 text-[15px] font-medium tracking-[-0.01em] text-[#1c1917] dark:text-[#efede8] sm:mt-4 sm:text-[17px]">
                Почніть писати, і ШІ вас підтримає
              </p>
              <p className="mt-1 text-[12px] text-[#736d65] dark:text-[#8a847c] sm:text-[13px]">
                {language === 'da' ? 'Dansk · діалог і виправлення' : 'English · діалог і виправлення'}
              </p>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-4 pb-2 sm:gap-6 sm:pb-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message._id ?? `${message.createdAt}-${message.role}`}
                  message={message}
                  onPlayFull={onPlayFull}
                  playbackSpeed={playbackSpeed}
                  playbackSpeeds={playbackSpeeds}
                  onPlaybackSpeedChange={onPlaybackSpeedChange}
                  onStopAudio={onStopAudio}
                  isPlaying={isPlaying}
                  playingText={playingText}
                  onShowToast={onShowToast}
                />
              ))}

              {streamingContent && (
                <ChatMessage
                  message={{
                    chatId: chatId ?? 'streaming',
                    userId: 'ai',
                    role: 'assistant',
                    content: streamingContent,
                    createdAt: new Date().toISOString()
                  }}
                  onPlayFull={onPlayFull}
                  playbackSpeed={playbackSpeed}
                  playbackSpeeds={playbackSpeeds}
                  onPlaybackSpeedChange={onPlaybackSpeedChange}
                  isPlaying={false}
                  isStreaming
                  onShowToast={onShowToast}
                />
              )}

              <div ref={scrollEndRef} className="h-1" />
            </div>
          )}
        </div>
      </div>

      <ScrollToBottomButton
        visible={showScrollBottom}
        onClick={scrollToBottom}
        hasNewMessages={Boolean(streamingContent)}
      />
    </div>
  );
};
