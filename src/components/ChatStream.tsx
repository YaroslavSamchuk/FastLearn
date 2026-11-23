// language: TypeScript (React), file: src/components/ChatStream.tsx, target: Web / Mobile Browser
import React, { useEffect, useRef, useState } from 'react';
import { Message, Language } from '../types.ts';
import { ChatMessage } from './ChatMessage.tsx';
import { Sparkles, ArrowUpRight, Compass, MessageCircle, BookOpen } from 'lucide-react';
import { ScrollToBottomButton } from './ScrollToBottomButton.tsx';
import { haptic } from '../utils/haptics.ts';

interface ChatStreamProps {
  messages: Message[];
  language: Language;
  onPlayFull: (text: string, speed?: number) => void;
  streamingContent?: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onQuickSend?: (text: string) => void;
  isPlaying?: boolean;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  language,
  onPlayFull,
  streamingContent,
  containerRef,
  onQuickSend,
  isPlaying = false,
  onShowToast
}) => {
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Auto-scroll on new message or streaming token
  useEffect(() => {
    if (!showScrollBottom) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, showScrollBottom]);

  // Track scroll position to show "Scroll to bottom" button
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    setShowScrollBottom(distanceToBottom > 240);
  };

  const scrollToBottom = () => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  // Dynamic Time-Aware Greeting (ChatGPT / Gemini Mobile signature)
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (language === 'da') {
      if (hour < 12) return { main: 'Godmorgen', sub: 'Klar til dagens samtale på dansk?' };
      if (hour < 18) return { main: 'God eftermiddag', sub: 'Hvad vil du gerne øve i dag?' };
      return { main: 'Godaften', sub: 'Lad os tage en afslappet snak på dansk.' };
    } else {
      if (hour < 12) return { main: 'Good morning', sub: 'Ready for today’s practice session?' };
      if (hour < 18) return { main: 'Good afternoon', sub: 'What would you like to practice today?' };
      return { main: 'Good evening', sub: 'Let’s enjoy a smooth conversation.' };
    }
  };

  const greeting = getGreeting();

  const starterSuggestions =
    language === 'da'
      ? [
          {
            icon: Compass,
            text: 'Hej! Hvordan går det i dag?',
            label: 'Hej! Hvordan går det?',
            translation: 'Привіт! Як справи сьогодні?'
          },
          {
            icon: MessageCircle,
            text: 'Lad os bestille mad på en hyggelig café i København',
            label: 'Bestil på en café',
            translation: 'Замовити їжу в затишному кафе'
          },
          {
            icon: BookOpen,
            text: 'Fortæl mig 3 typiske danske udtryk og deres betydning',
            label: '3 danske udtryk',
            translation: '3 типові данські ідіоми та вирази'
          }
        ]
      : [
          {
            icon: Compass,
            text: 'Hello! How is your day going?',
            label: 'Hello! How are you?',
            translation: 'Привіт! Як твій день?'
          },
          {
            icon: MessageCircle,
            text: 'Let’s simulate a natural job interview conversation',
            label: 'Job interview practice',
            translation: 'Практика співбесіди на роботу'
          },
          {
            icon: BookOpen,
            text: 'Explain 3 natural English idioms used in daily life',
            label: '3 daily idioms',
            translation: '3 живі англійські ідіоми'
          }
        ];

  const handleSuggestionClick = (text: string) => {
    haptic.send();
    if (onQuickSend) {
      onQuickSend(text);
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto px-3.5 sm:px-6 py-4 overscroll-contain select-text"
    >
      <div className="max-w-3xl mx-auto flex flex-col justify-end min-h-full">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 sm:p-8 my-auto animate-message-enter">
            {/* Living Gemini Sparkle Icon Badge */}
            <div className="relative mb-5">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-gradient-to-tr from-amber-400/20 via-yellow-400/30 to-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-500 shadow-aura animate-float">
                <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 stroke-[1.8] animate-gemini-glow" />
              </div>
            </div>

            {/* Time-Aware Living Greeting */}
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 mb-2">
              {greeting.main}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-sm mb-7 leading-relaxed">
              {greeting.sub}
            </p>

            {/* Quick Starter Suggestion Chips (Mobile Carousel / Grid) */}
            {onQuickSend && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full max-w-2xl">
                {starterSuggestions.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSuggestionClick(item.text)}
                      className="group relative flex flex-col justify-between p-3.5 rounded-2xl glass-pill border border-zinc-200/80 dark:border-white/5 hover:border-amber-400/80 dark:hover:border-amber-400/60 text-left transition-all duration-200 cursor-pointer shadow-xs active:scale-[0.97]"
                    >
                      <div className="flex items-center justify-between w-full mb-2.5">
                        <span className="p-1.5 rounded-xl bg-amber-400/10 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                          <Icon className="w-4 h-4 stroke-[1.8]" />
                        </span>
                        <ArrowUpRight className="w-4 h-4 text-zinc-400 group-hover:text-amber-500 transition-colors" />
                      </div>
                      <div>
                        <div className="text-xs sm:text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1 mb-0.5">
                          {item.label}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 leading-snug">
                          {item.translation}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1 w-full pb-2">
            {messages.map((msg, idx) => (
              <ChatMessage
                key={msg._id || idx}
                message={msg}
                onPlayFull={onPlayFull}
                isPlaying={isPlaying}
                onShowToast={onShowToast}
              />
            ))}

            {streamingContent && (
              <ChatMessage
                message={{
                  chatId: 'streaming',
                  userId: 'ai',
                  role: 'assistant',
                  content: streamingContent,
                  createdAt: new Date().toISOString()
                }}
                onPlayFull={onPlayFull}
                isStreaming={true}
                onShowToast={onShowToast}
              />
            )}

            <div ref={scrollEndRef} className="h-2" />
          </div>
        )}
      </div>

      {/* Floating Scroll-to-Bottom Pill Button */}
      <ScrollToBottomButton
        visible={showScrollBottom}
        onClick={scrollToBottom}
        hasNewMessages={!!streamingContent}
      />
    </div>
  );
};
