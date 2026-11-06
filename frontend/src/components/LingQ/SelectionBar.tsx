import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Languages, BookmarkPlus, X, Loader2, Check } from 'lucide-react';
import { SpeechService } from '../../services/speech';
import { GeminiService } from '../../services/gemini';

interface SelectionBarProps {
  phraseText: string;
  targetRect: DOMRect | null;
  apiKey: string;
  model: string;
  speechRate: number;
  onSavePhrase: (phrase: string, translation: string) => void;
  onClose: () => void;
}

export const SelectionBar: React.FC<SelectionBarProps> = ({
  phraseText,
  targetRect,
  apiKey,
  model,
  speechRate,
  onSavePhrase,
  onClose,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setTranslatedText(null);
    setIsSaved(false);
  }, [phraseText]);

  // Click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSpeak = () => {
    SpeechService.speak(phraseText, { rate: speechRate });
  };

  const handleTranslate = async () => {
    if (translatedText) return;
    setIsTranslating(true);
    try {
      const res = await GeminiService.translatePhrase({
        apiKey,
        model,
        phrase: phraseText,
      });
      setTranslatedText(res);
    } catch {
      setTranslatedText('Помилка перекладу');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSave = () => {
    onSavePhrase(phraseText, translatedText || '');
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // Calculate coordinates
  const getCoordinates = () => {
    if (!targetRect) return { top: 100, left: 20 };
    const left = Math.max(10, Math.min(window.innerWidth - 300, targetRect.left));
    const top = targetRect.top > 60 ? targetRect.top - 50 : targetRect.bottom + 10;
    return { top, left };
  };

  const coords = getCoordinates();

  return (
    <div
      ref={barRef}
      style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
      className="fixed z-50 bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000000] p-1.5 flex flex-col gap-1.5 min-w-[240px] max-w-[360px]"
    >
      <div className="flex items-center gap-1">
        <button
          onClick={handleSpeak}
          className="flex items-center gap-1 px-2 py-1 bg-zinc-100 hover:bg-black hover:text-white border border-black text-xs font-mono transition-colors"
          title="Озвучити датською"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Озвучити</span>
        </button>

        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          className="flex items-center gap-1 px-2 py-1 bg-zinc-100 hover:bg-black hover:text-white border border-black text-xs font-mono transition-colors disabled:opacity-50"
          title="Перекласти на українську"
        >
          {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
          <span>Переклад</span>
        </button>

        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-2 py-1 bg-zinc-100 hover:bg-black hover:text-white border border-black text-xs font-mono transition-colors"
          title="Зберегти вираз у словник"
        >
          {isSaved ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
          <span>{isSaved ? 'Збережено' : 'Словник'}</span>
        </button>

        <button
          onClick={onClose}
          className="p-1 hover:bg-black hover:text-white border border-black ml-auto transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {translatedText && (
        <div className="p-2 bg-yellow-50 border border-black text-xs font-sans text-zinc-900 leading-snug">
          <span className="font-mono text-[10px] text-zinc-500 block uppercase mb-0.5">Переклад (UA):</span>
          {translatedText}
        </div>
      )}
    </div>
  );
};
