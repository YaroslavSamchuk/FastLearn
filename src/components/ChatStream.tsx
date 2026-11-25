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
  text: string;
  label: string;
  translation: string;
}

const STARTERS: Record<Language, Starter[]> = {
  da: [
    {
      text: 'Hej! Hvordan går det i dag?',
      label: 'Hej! Hvordan går det?',
      translation: 'Привіт! Як справи сьогодні?'
    },
    {
      text: 'Lad os bestille mad på en hyggelig café i København',
      label: 'Bestil på en café',
      translation: 'Замовити їжу в затишному кафе'
    },
    {
      text: 'Fortæl mig 3 typiske danske udtryk og deres betydning',
      label: '3 danske udtryk',
      translation: '3 типові данські вирази та їхнє значення'
    }
  ],
  en: [
    {
      text: 'Hello! How is your day going?',
      label: 'Hello! How are you?',
      translation: 'Привіт! Як твій день?'
    },
    {
      text: 'Let’s simulate a natural job interview conversation',
      label: 'Job interview practice',
      translation: 'Практика співбесіди на роботу'
    },
    {
      text: 'Explain 3 natural English idioms used in daily life',
      label: '3 daily idioms',
      translation: '3 живі англійські ідіоми'
    }
  ]
};

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  language,
  onPlayFull,
  playbackSpeed,
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
          title: 'Klar til at øve?',
          subtitle: 'Skriv en besked på dansk, eller vælg et udgangspunkt.',
          label: 'Dansk'
        }
      : {
          title: 'Ready to practice?',
          subtitle: 'Write a message in English, or start with one of these.',
          label: 'English'
        };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-6 select-text sm:px-6"
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex flex-1 flex-col justify-center py-12">
            <p className="font-mono text-[11px] text-stone-500 dark:text-stone-500">
              {starterCopy.label}
            </p>
            <h2 className="mt-2 text-[28px] font-medium leading-tight text-stone-950 dark:text-stone-50 sm:text-3xl">
              {starterCopy.title}
            </h2>
            <p className="mt-3 max-w-md text-[14px] leading-6 text-stone-600 dark:text-stone-400">
              {starterCopy.subtitle}
            </p>

            {onQuickSend && (
              <div className="mt-8 grid w-full gap-2 sm:grid-cols-3">
                {STARTERS[language].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleSuggestionClick(item.text)}
                    className="group rounded-xl border border-stone-200 bg-white px-4 py-4 text-left transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500/30 dark:border-white/[0.08] dark:bg-[#191817] dark:hover:border-white/[0.14] dark:hover:bg-[#201e1c]"
                  >
                    <span className="block text-[13px] font-medium leading-snug text-stone-900 dark:text-stone-100">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-stone-500 dark:text-stone-500">
                      {item.translation}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-5 pb-4">
            {messages.map((message) => (
              <ChatMessage
                key={message._id ?? `${message.createdAt}-${message.role}`}
                message={message}
                onPlayFull={onPlayFull}
                playbackSpeed={playbackSpeed}
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
