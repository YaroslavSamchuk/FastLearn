import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Languages, Bookmark, X, Loader2, Check } from 'lucide-react';
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
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setTranslatedText(null);
    setIsSaved(false);
  }, [phraseText]);

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

  const getCoordinates = () => {
    if (!targetRect || isMobile) return { top: 0, left: 0 };
    const left = Math.max(16, Math.min(window.innerWidth - 300, targetRect.left));
    const top = targetRect.top > 60 ? targetRect.top - 46 : targetRect.bottom + 8;
    return { top, left };
  };

  const coords = getCoordinates();

  return (
    <div
      ref={barRef}
      style={!isMobile ? { top: `${coords.top}px`, left: `${coords.left}px` } : undefined}
      className={`${
        isMobile
          ? 'fixed bottom-20 inset-x-3 z-50 max-w-sm mx-auto'
          : 'fixed z-50 min-w-[220px] max-w-[320px]'
      } bg-stone-900 text-white rounded-lg p-1.5 shadow-xl border border-stone-800 text-xs font-sans`}
    >
      <div className="flex items-center gap-1 justify-between">
        <button
          onClick={handleSpeak}
          className="flex items-center gap-1 px-2 py-1 hover:bg-stone-800 rounded transition-colors text-stone-200"
          title="Озвучити"
        >
          <Volume2 className="w-3.5 h-3.5 text-stone-300" />
          <span>Озвучити</span>
        </button>

        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          className="flex items-center gap-1 px-2 py-1 hover:bg-stone-800 rounded transition-colors text-stone-200 disabled:opacity-50"
          title="Перекласти"
        >
          {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5 text-stone-300" />}
          <span>Переклад</span>
        </button>

        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-2 py-1 hover:bg-stone-800 rounded transition-colors text-stone-200"
          title="Зберегти"
        >
          {isSaved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Bookmark className="w-3.5 h-3.5 text-stone-300" />}
          <span>{isSaved ? 'Збережено' : 'Словник'}</span>
        </button>

        <button
          onClick={onClose}
          className="p-1 hover:bg-stone-800 text-stone-400 hover:text-white rounded ml-auto"
          aria-label="Закрити"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {translatedText && (
        <div className="mt-1.5 pt-1.5 border-t border-stone-800 px-1 text-xs text-stone-200 leading-snug">
          <span className="text-[10px] text-stone-400 block font-mono">Переклад:</span>
          {translatedText}
        </div>
      )}
    </div>
  );
};
