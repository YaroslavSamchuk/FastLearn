import React, { useEffect, useState, useRef } from 'react';
import { Volume2, X, Check, Loader2 } from 'lucide-react';
import type { WordStatus } from '../../types';
import { SpeechService } from '../../services/speech';
import { GeminiService } from '../../services/gemini';
import { cleanDanishWord, lookupLocalWord } from '../../services/dictionary';

interface WordPopoverProps {
  word: string;
  contextSentence: string;
  targetRect: DOMRect | null;
  currentStatus: WordStatus;
  savedTranslation?: string;
  apiKey: string;
  model: string;
  speechRate: number;
  onUpdateStatus: (word: string, status: WordStatus, translation?: string, synonyms?: string[]) => void;
  onClose: () => void;
}

export const WordPopover: React.FC<WordPopoverProps> = ({
  word,
  contextSentence,
  targetRect,
  currentStatus,
  savedTranslation = '',
  apiKey,
  model,
  speechRate,
  onUpdateStatus,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const clean = cleanDanishWord(word);

  const [translation, setTranslation] = useState<string>(savedTranslation);
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [pos, setPos] = useState<string | undefined>();
  const [explanation, setExplanation] = useState<string | undefined>();
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState<WordStatus>(currentStatus);
  const [isEditingTranslation, setIsEditingTranslation] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Pronounce word on open
  useEffect(() => {
    SpeechService.speak(word, { rate: speechRate });
  }, [word, speechRate]);

  // Load word details
  useEffect(() => {
    let isCancelled = false;

    const loadDetails = async () => {
      const local = lookupLocalWord(clean);
      if (local) {
        if (!savedTranslation) setTranslation(local.translation);
        if (local.synonyms) setSynonyms(local.synonyms);
        if (local.pos) setPos(local.pos);
        if (local.explanation) setExplanation(local.explanation);
      }

      if (!savedTranslation && apiKey) {
        setLoading(true);
        try {
          const res = await GeminiService.translateWord({
            apiKey,
            model,
            word,
            contextSentence,
          });
          if (!isCancelled) {
            setTranslation(res.translation_uk);
            if (res.synonyms?.length) setSynonyms(res.synonyms);
            if (res.part_of_speech) setPos(res.part_of_speech);
            if (res.explanation_uk) setExplanation(res.explanation_uk);
          }
        } catch {
          // Keep local fallback
        } finally {
          if (!isCancelled) setLoading(false);
        }
      }
    };

    loadDetails();
    return () => {
      isCancelled = true;
    };
  }, [word, clean, contextSentence, apiKey, model, savedTranslation]);

  // Desktop keyboard shortcuts: 1, 2, 3, 0, Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (!isEditingTranslation) {
        if (e.key === '1') handleSetStatus(1);
        else if (e.key === '2') handleSetStatus(2);
        else if (e.key === '3') handleSetStatus(3);
        else if (e.key === '0' || e.key === '4') handleSetStatus(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditingTranslation, translation, synonyms]);

  // Click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSetStatus = (status: WordStatus) => {
    setSelectedStatus(status);
    onUpdateStatus(word, status, translation, synonyms);
  };

  const handlePlayAudio = () => {
    SpeechService.speak(word, { rate: speechRate });
  };

  // Desktop coordinates calculation
  const getCoordinates = () => {
    if (!targetRect || isMobile) return { top: 0, left: 0 };

    const popoverWidth = 300;
    const padding = 16;

    let left = targetRect.left;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) left = padding;

    let top = targetRect.bottom + 8;
    if (top + 240 > window.innerHeight && targetRect.top > 250) {
      top = targetRect.top - 250;
    }

    return { top: Math.max(padding, top), left };
  };

  const coords = getCoordinates();

  const popoverContent = (
    <div
      ref={popoverRef}
      style={!isMobile ? { top: `${coords.top}px`, left: `${coords.left}px` } : undefined}
      className={`${
        isMobile
          ? 'fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl border-t border-stone-300 p-4 pb-safe shadow-2xl max-w-md mx-auto animate-in slide-in-from-bottom-6 duration-200'
          : 'fixed z-50 w-76 bg-white rounded-lg border border-stone-300 p-3.5 shadow-lg'
      } text-stone-900 font-sans`}
    >
      {/* Mobile drag handle indicator */}
      {isMobile && (
        <div className="w-10 h-1 bg-stone-300 rounded-full mx-auto mb-3" />
      )}

      {/* Header: Word & Audio button */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-stone-900">
            {word}
          </span>
          <button
            onClick={handlePlayAudio}
            className="p-1 text-stone-500 hover:text-stone-950 rounded transition-colors"
            title="Озвучити"
            aria-label="Озвучити слово"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          {pos && (
            <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-1 py-0.5 rounded">
              {pos}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-stone-400 hover:text-stone-800 rounded transition-colors"
          aria-label="Закрити"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Translation row */}
      <div className="mb-3">
        {loading ? (
          <div className="flex items-center gap-1.5 py-1 text-xs text-stone-500 font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
            <span>Переклад...</span>
          </div>
        ) : isEditingTranslation ? (
          <div className="flex gap-1.5 mt-1">
            <input
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="flex-1 px-2.5 py-1 text-xs sm:text-sm border border-stone-300 rounded focus:outline-none focus:border-stone-900"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditingTranslation(false);
                  onUpdateStatus(word, selectedStatus, translation, synonyms);
                }
              }}
            />
            <button
              onClick={() => {
                setIsEditingTranslation(false);
                onUpdateStatus(word, selectedStatus, translation, synonyms);
              }}
              className="px-2.5 py-1 bg-stone-900 text-white text-xs rounded"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => setIsEditingTranslation(true)}
            className="text-sm sm:text-base font-medium text-stone-900 cursor-pointer hover:bg-stone-50 p-1 -mx-1 rounded transition-colors flex items-center justify-between group"
            title="Клікніть щоб редагувати"
          >
            <span>{translation || <span className="text-stone-400 font-normal italic">Немає перекладу</span>}</span>
            <span className="text-[10px] text-stone-400 opacity-60">змінити</span>
          </div>
        )}

        {explanation && (
          <p className="text-[11px] text-stone-500 mt-1 leading-snug">
            {explanation}
          </p>
        )}
      </div>

      {/* Synonyms */}
      {synonyms.length > 0 && (
        <div className="mb-3 pt-2 border-t border-stone-100">
          <div className="text-[10px] font-mono text-stone-400 uppercase tracking-wider mb-1.5">
            Синоніми:
          </div>
          <div className="flex flex-wrap gap-1">
            {synonyms.slice(0, 4).map((syn, idx) => (
              <button
                key={idx}
                onClick={() => SpeechService.speak(syn, { rate: speechRate })}
                className="text-xs px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded transition-colors flex items-center gap-1"
              >
                <span>{syn}</span>
                <Volume2 className="w-2.5 h-2.5 text-stone-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status level tabs (LingQ) */}
      <div className="pt-2 border-t border-stone-200">
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
          <button
            onClick={() => handleSetStatus(0)}
            className={`py-1.5 text-xs font-mono rounded transition-colors ${
              selectedStatus === 0
                ? 'bg-sky-100 text-sky-900 font-medium ring-1 ring-sky-300'
                : 'bg-stone-50 hover:bg-stone-100 text-stone-600'
            }`}
          >
            Нове
          </button>
          <button
            onClick={() => handleSetStatus(1)}
            className={`py-1.5 text-xs font-mono rounded transition-colors ${
              selectedStatus === 1
                ? 'bg-amber-100 text-amber-900 font-medium ring-1 ring-amber-300'
                : 'bg-stone-50 hover:bg-stone-100 text-stone-600'
            }`}
          >
            Вчу 1
          </button>
          <button
            onClick={() => handleSetStatus(2)}
            className={`py-1.5 text-xs font-mono rounded transition-colors ${
              selectedStatus === 2
                ? 'bg-yellow-100 text-yellow-900 font-medium ring-1 ring-yellow-300'
                : 'bg-stone-50 hover:bg-stone-100 text-stone-600'
            }`}
          >
            Вчу 2
          </button>
          <button
            onClick={() => handleSetStatus(3)}
            className={`py-1.5 text-xs font-mono rounded transition-colors ${
              selectedStatus === 3
                ? 'bg-emerald-100 text-emerald-900 font-medium ring-1 ring-emerald-300'
                : 'bg-stone-50 hover:bg-stone-100 text-stone-600'
            }`}
          >
            Знаю
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-[1px] animate-in fade-in"
          onClick={onClose}
        />
      )}
      {popoverContent}
    </>
  );
};
