import React, { useEffect, useRef } from 'react';
import { Message, Language } from '../types.ts';
import { ChatMessage } from './ChatMessage.tsx';

interface ChatStreamProps {
  messages: Message[];
  language: Language;
  onPlayFull: (text: string) => void;
  streamingContent?: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  language,
  onPlayFull,
  streamingContent,
  containerRef
}) => {
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-2 sm:px-4 py-3 space-y-1 overscroll-contain select-text"
    >
      {messages.length === 0 && !streamingContent ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
          <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center mb-3 text-amber-400 font-mono text-sm">
            {language.toUpperCase()}
          </div>
          <div className="text-sm font-medium text-zinc-300 mb-1">
            {language === 'da' ? 'Ingen beskeder endnu' : 'No messages yet'}
          </div>
          <div className="text-xs text-zinc-500 max-w-xs leading-relaxed">
            {language === 'da'
              ? 'Skriv "Hej!" eller "Hvad så?" for at starte en hurtig samtale. Marker et ord for at høre udtale og se oversættelse.'
              : 'Type "Hey!" or "What\'s up?" to start chatting. Highlight any word or sentence to hear pronunciation and see translation.'}
          </div>
        </div>
      ) : (
        <>
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

          <div ref={scrollEndRef} className="h-2" />
        </>
      )}
    </div>
  );
};
