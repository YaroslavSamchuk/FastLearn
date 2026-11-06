import React from 'react';
import { Volume2, CheckCircle2 } from 'lucide-react';
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
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-4 sm:mb-5`}>
      {/* Header bar: role and timestamp */}
      <div className="flex items-center gap-2 mb-1 text-[11px] font-mono text-stone-500 px-1">
        <span className="font-semibold text-stone-800">
          {isUser ? 'Ви' : 'Тьютор'}
        </span>
        {message.model_used && !isUser && (
          <span className="text-[10px] text-stone-400">
            {message.model_used.replace('gemini-', '')}
          </span>
        )}
        <span className="text-[10px] text-stone-400">{message.timestamp}</span>
        {!isUser && (
          <button
            onClick={handleSpeakFull}
            className="p-1 hover:text-stone-950 text-stone-400 transition-colors"
            title="Озвучити відповідь"
            aria-label="Озвучити репліку"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Message bubble card */}
      <div
        className={`w-full max-w-[92%] sm:max-w-[80%] md:max-w-[72%] p-3 sm:p-3.5 rounded-lg border text-sm sm:text-base leading-relaxed ${
          isUser
            ? 'bg-stone-900 text-white border-stone-900'
            : 'bg-white text-stone-900 border-stone-200 shadow-sm'
        }`}
      >
        <InteractiveText
          text={message.content}
          wordsMap={wordsMap}
          onWordClick={onWordClick}
          onPhraseSelect={onPhraseSelect}
          selectedPhrase={selectedPhrase}
        />

        {/* Pedagogical Correction Block (Only for AI feedback) */}
        {message.correction && message.correction.has_correction && (
          <div className="mt-3 pt-3 border-t border-amber-200/80 bg-amber-50/70 -mx-3 -mb-3 p-3 rounded-b-lg text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-amber-900">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
              <span>Корекція виразу</span>
            </div>

            {/* What user meant */}
            {message.correction.what_you_meant_uk && (
              <div className="text-stone-700 leading-snug">
                <span className="text-stone-500 font-mono text-[11px] block">Мали на увазі:</span>
                <span className="text-stone-900">{message.correction.what_you_meant_uk}</span>
              </div>
            )}

            {/* Natural Danish */}
            {message.correction.natural_danish && (
              <div className="flex items-center justify-between gap-2 bg-white/90 p-2 rounded border border-amber-200/80">
                <div>
                  <span className="text-amber-800 font-mono text-[10px] block">Природніше датською:</span>
                  <span className="font-medium text-stone-950 text-xs sm:text-sm">
                    {message.correction.natural_danish}
                  </span>
                </div>
                <button
                  onClick={() => handleSpeakCorrection(message.correction!.natural_danish)}
                  className="p-1 hover:bg-stone-100 rounded text-stone-700 shrink-0"
                  title="Озвучити правильний варіант"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Rule explanation */}
            {message.correction.explanation_uk && (
              <p className="text-[11px] text-stone-600 leading-normal">
                {message.correction.explanation_uk}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
