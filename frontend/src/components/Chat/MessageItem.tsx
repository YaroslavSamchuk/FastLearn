import React from 'react';
import { Volume2, Sparkles, AlertCircle } from 'lucide-react';
import type { ChatMessage, WordMap } from '../../types';
import { InteractiveText } from '../LingQ/InteractiveText';
import { SpeechService } from '../../services/speech';

interface MessageItemProps {
  message: ChatMessage;
  wordsMap: WordMap;
  speechRate: number;
  onWordClick: (word: string, contextSentence: string, targetRect: DOMRect) => void;
  onPhraseSelect?: (phraseText: string, targetRect: DOMRect) => void;
  selectedPhrase?: string | null;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  wordsMap,
  speechRate,
  onWordClick,
  onPhraseSelect,
  selectedPhrase,
}) => {
  const isUser = message.role === 'user';

  const handleSpeakFull = () => {
    SpeechService.speak(message.content, { rate: speechRate });
  };

  const handleSpeakCorrection = (text: string) => {
    SpeechService.speak(text, { rate: speechRate });
  };

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-5`}>
      {/* Header bar: metadata badge */}
      <div className="flex items-center gap-2 mb-1 text-[11px] font-mono text-zinc-500">
        <span className="font-bold text-black uppercase">
          {isUser ? '[ВИ]' : '[DANSK TUTOR]'}
        </span>
        {message.model_used && !isUser && (
          <span className="bg-zinc-100 px-1 border border-zinc-300 text-zinc-700">
            {message.model_used}
          </span>
        )}
        <span>{message.timestamp}</span>
        {!isUser && (
          <button
            onClick={handleSpeakFull}
            className="p-0.5 hover:bg-zinc-200 border border-black transition-colors"
            title="Озвучити все повідомлення датською"
          >
            <Volume2 className="w-3.5 h-3.5 text-black" />
          </button>
        )}
      </div>

      {/* Message content card */}
      <div
        className={`max-w-[85%] md:max-w-[75%] p-3.5 brutal-border ${
          isUser
            ? 'bg-zinc-100 text-zinc-950 brutal-shadow'
            : 'bg-white text-zinc-950 brutal-shadow'
        }`}
      >
        <div className="text-base leading-relaxed">
          <InteractiveText
            text={message.content}
            wordsMap={wordsMap}
            onWordClick={onWordClick}
            onPhraseSelect={onPhraseSelect}
            selectedPhrase={selectedPhrase}
          />
        </div>

        {/* Pedagogical Correction Block */}
        {message.correction && message.correction.has_correction && (
          <div className="mt-3.5 pt-3 border-t-2 border-black bg-amber-50/70 p-2.5 brutal-border-sm">
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-amber-900 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span>Зворотний звʼязок та виправлення:</span>
            </div>

            {/* What you meant */}
            {message.correction.what_you_meant_uk && (
              <div className="text-xs mb-1.5">
                <span className="font-semibold text-zinc-700 font-mono">💡 Мали на увазі: </span>
                <span className="text-zinc-900 italic">«{message.correction.what_you_meant_uk}»</span>
              </div>
            )}

            {/* Natural Danish */}
            {message.correction.natural_danish && (
              <div className="text-xs mb-1.5 flex items-baseline gap-1.5 bg-white p-1.5 border border-black">
                <span className="font-semibold text-emerald-800 font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  Природніше датською:
                </span>
                <span className="font-bold text-zinc-950">
                  {message.correction.natural_danish}
                </span>
                <button
                  onClick={() => handleSpeakCorrection(message.correction!.natural_danish)}
                  className="p-0.5 hover:bg-zinc-100 border border-black ml-auto"
                  title="Озвучити правильний варіант"
                >
                  <Volume2 className="w-3.5 h-3.5 text-black" />
                </button>
              </div>
            )}

            {/* Explanation rule */}
            {message.correction.explanation_uk && (
              <div className="text-xs text-zinc-700 mt-1 leading-snug">
                <span className="font-semibold font-mono text-zinc-800">ℹ️ Правило: </span>
                {message.correction.explanation_uk}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
