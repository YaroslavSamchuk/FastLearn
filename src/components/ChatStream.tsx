// language: TypeScript (React), file: src/components/ChatStream.tsx, target: Web / Mobile Browser
import React, { useEffect, useRef, useState } from 'react';
import { Message, Language } from '../types.ts';
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
  onQuickSend?: (text: string) => void;
  isPlaying?: boolean;
  playingText?: string;
  chatId?: string;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

interface Starter {
  index: string;
  text: string;
  label: string;
  translation: string;
}

const STARTERS: Record<Language, Starter[]> = {
  da: [
    {
      index: '01',
      text: 'Hej! Hvordan går det i dag?',
      label: 'Hej, hvordan går det?',
      translation: 'Коротка розмова про день'
    },
    {
      index: '02',
      text: 'Lad os bestille mad på en hyggelig café i København',
      label: 'Bestil på en café',
      translation: 'Замовлення у кав’ярні в Копенгагені'
    },
    {
      index: '03',
      text: 'Fortæl mig 3 typiske danske udtryk og deres betydning',
      label: '3 danske udtryk',
      translation: 'Живі ідіоми зі значенням і вимовою'
    }
  ],
  en: [
    {
      index: '01',
      text: 'Hello! How is your day going?',
      label: 'Hello, how are you?',
      translation: 'Невимушений вступний діалог'
    },
    {
      index: '02',
      text: 'Let’s simulate a natural job interview conversation',
      label: 'Job interview practice',
      translation: 'Симуляція співбесіди англійською'
    },
    {
      index: '03',
      text: 'Explain 3 natural English idioms used in daily life',
      label: '3 daily idioms',
      translation: 'Три повсякденні вирази з прикладами'
    }
  ]
};

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
  onQuickSend,
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

  const handleSuggestionClick = (text: string) => {
    haptic.send();
    onQuickSend?.(text);
  };

  const starterCopy =
    language === 'da'
      ? {
          code: 'Dansk · Щоденна практика',
          title: 'Практика данської',
          subtitle: 'Пишіть данською чи українською, або оберіть сценарій'
        }
      : {
          code: 'English · Щоденна практика',
          title: 'Практика англійської',
          subtitle: 'Пишіть англійською чи українською, або оберіть сценарій'
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
            <div className="my-auto py-2 sm:py-8">
              <div className="border-l-2 border-amber-500 pl-3.5 sm:pl-4">
                <p className="font-mono text-[12px] text-[#736d65] dark:text-[#a8a29a]">
                  {starterCopy.code}
                </p>
                <h2 className="mt-1.5 text-[22px] font-medium leading-tight tracking-[-0.01em] text-[#1c1917] dark:text-[#efede8] sm:mt-2 sm:text-[28px]">
                  {starterCopy.title}
                </h2>
                <p className="mt-1.5 max-w-md text-[13px] leading-snug text-[#57534e] dark:text-[#a8a29a] sm:mt-2 sm:text-[14px] sm:leading-6">
                  {starterCopy.subtitle}
                </p>
              </div>

              {onQuickSend && (
                <div className="mt-4 grid w-full divide-y divide-black/[0.08] overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:divide-white/[0.08] dark:border-white/[0.08] dark:bg-[#1c1a18] sm:mt-8 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {STARTERS[language].map((item) => (
                    <button
                      key={item.index}
                      type="button"
                      onClick={() => handleSuggestionClick(item.text)}
                      className="group flex flex-row items-baseline gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 ease-unslop hover:bg-[#f6f5f1] dark:hover:bg-[#262421] sm:flex-col sm:items-start sm:justify-between sm:gap-3 sm:p-4"
                    >
                      <span className="w-5 shrink-0 font-mono text-[12px] tabular-nums text-amber-700 dark:text-amber-400 sm:w-auto">
                        {item.index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium leading-snug text-[#1c1917] dark:text-[#efede8]">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-[#736d65] dark:text-[#8a847c] sm:mt-1">
                          {item.translation}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
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
