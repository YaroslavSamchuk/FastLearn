import React, { useEffect, useRef } from 'react';
import { Message, Language } from '../types.ts';
import { ChatMessage } from './ChatMessage.tsx';
import { MessageSquare, ArrowUpRight } from 'lucide-react';

interface ChatStreamProps {
  messages: Message[];
  language: Language;
  onPlayFull: (text: string) => void;
  streamingContent?: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onQuickSend?: (text: string) => void;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  language,
  onPlayFull,
  streamingContent,
  containerRef,
  onQuickSend
}) => {
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const starterSuggestions = language === 'da'
    ? [
        { text: 'Hej! Hvordan går det?', label: 'Hej! Hvordan går det?', translation: 'Привіт! Як справи?' },
        { text: 'Hvad kan du hjælpe mig med?', label: 'Hvad kan du hjælpe mig med?', translation: 'З чим ти можеш допомогти?' },
        { text: 'Fortæl lidt om København og hverdagen i Danmark', label: 'Fortæl om Danmark', translation: 'Розкажи про Данію та Копенгаген' }
      ]
    : [
        { text: 'Hello! How are you doing today?', label: 'Hello! How are you?', translation: 'Привіт! Як твої справи?' },
        { text: 'What are some practical topics we can practice?', label: 'Practical topics', translation: 'Корисні теми для практики' },
        { text: 'Help me practice everyday natural conversation', label: 'Everyday conversation', translation: 'Допоможи з живою розмовою' }
      ];

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 overscroll-contain select-text"
    >
      <div className="max-w-3xl mx-auto flex flex-col justify-end min-h-full">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 sm:p-8 my-auto animate-message-enter">
            {/* Minimalist Brutalist Header Tag */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
              <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
              <span>{language === 'da' ? 'FASTLEARN // DANSK' : 'FASTLEARN // ENGLISH'}</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-semibold text-zinc-950 dark:text-zinc-100 mb-2.5 tracking-tight">
              {language === 'da' ? 'Розмовна практика данської' : 'Розмовна практика англійської'}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mb-8 leading-relaxed">
              Спілкуйтеся живою мовою. Виділяйте будь-яке слово або фразу для миттєвої фонетики IPA, перекладу та озвучення.
            </p>

            {/* Quick Starter Suggestions */}
            {onQuickSend && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
                {starterSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => onQuickSend(item.text)}
                    className="group relative flex flex-col justify-between p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-amber-400 dark:hover:border-amber-400/80 text-left transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                        [0{idx + 1}]
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-500 transition-colors" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-[13px] font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1 mb-0.5">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                        {item.translation}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1 w-full">
            {messages.map((msg, idx) => (
              <ChatMessage
                key={msg._id || idx}
                message={msg}
                onPlayFull={onPlayFull}
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
                isStreaming
              />
            )}

            <div ref={scrollEndRef} className="h-4" />
          </div>
        )}
      </div>
    </div>
  );
};
