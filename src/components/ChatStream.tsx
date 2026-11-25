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
          code: 'DA // Daglig praksis',
          title: 'Практика данської',
          subtitle: 'Пишіть данською чи українською, або оберіть сценарій'
        }
      : {
          code: 'EN // Daily practice',
          title: 'Практика англійської',
          subtitle: 'Пишіть англійською чи українською, або оберіть сценарій'
        };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-6 select-text sm:px-6"
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex flex-1 flex-col justify-center py-8">
            <div className="border-l-2 border-amber-500 pl-4">
              <p className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                {starterCopy.code}
              </p>
              <h2 className="mt-2 text-[28px] font-medium leading-tight text-[#111113] dark:text-zinc-50">
                {starterCopy.title}
              </h2>
              <p className="mt-2 max-w-md text-[14px] leading-6 text-zinc-600 dark:text-zinc-400">
                {starterCopy.subtitle}
              </p>
            </div>

            {onQuickSend && (
              <div className="mt-8 grid w-full divide-y divide-black/[0.09] overflow-hidden rounded-md border border-black/[0.1] bg-white dark:divide-white/[0.09] dark:border-white/[0.1] dark:bg-[#141416] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {STARTERS[language].map((item) => (
                  <button
                    key={item.index}
                    type="button"
                    onClick={() => handleSuggestionClick(item.text)}
                    className="group flex flex-col items-start justify-between gap-3 p-4 text-left transition-colors duration-150 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <span className="font-mono text-[11px] tabular-nums text-amber-700 dark:text-amber-400">
                      {item.index}
                    </span>
                    <div>
                      <span className="block text-[13px] font-medium leading-snug text-[#111113] dark:text-zinc-100">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                        {item.translation}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-6 pb-4">
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

      <ScrollToBottomButton
        visible={showScrollBottom}
        onClick={scrollToBottom}
        hasNewMessages={Boolean(streamingContent)}
      />
    </div>
  );
};
