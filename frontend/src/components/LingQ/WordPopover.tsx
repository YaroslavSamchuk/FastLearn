import React, { useEffect, useState, useRef } from 'react';
import { Volume2, X, Check, Loader2, Sparkles } from 'lucide-react';
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

  // Play audio for the word on open
  useEffect(() => {
    SpeechService.speak(word, { rate: speechRate });
  }, [word, speechRate]);

  // Load details (from local dict or Gemini API)
  useEffect(() => {
    let isCancelled = false;

    const loadDetails = async () => {
      // 1. Check local dictionary
      const local = lookupLocalWord(clean);
      if (local) {
        if (!savedTranslation) setTranslation(local.translation);
        if (local.synonyms) setSynonyms(local.synonyms);
        if (local.pos) setPos(local.pos);
        if (local.explanation) setExplanation(local.explanation);
      }

      // 2. If translation not yet known or to get rich synonyms from Gemini
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

  // Keyboard shortcut support: 1, 2, 3, 4, Esc
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

  // Outside click to close
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

  // Calculate popover positioning relative to target element
  const getCoordinates = () => {
    if (!targetRect) return { top: 100, left: 20 };

    const popoverWidth = 320;
    const padding = 12;

    let left = targetRect.left;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) left = padding;

    // Prefer below target element, fallback to above if near viewport bottom
    let top = targetRect.bottom + 8;
    if (top + 260 > window.innerHeight && targetRect.top > 260) {
      top = targetRect.top - 270;
    }

    return { top: Math.max(padding, top), left };
  };

  const coords = getCoordinates();

  return (
    <div
      ref={popoverRef}
      style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
      className="fixed z-50 w-80 bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-4 text-zinc-950 font-sans"
    >
      {/* Header: Word & Audio button */}
      <div className="flex items-start justify-between border-b-2 border-black pb-2.5 mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight text-black">{word}</span>
          <button
            onClick={handlePlayAudio}
            className="p-1 hover:bg-zinc-100 border border-black transition-colors"
            title="Озвучити датською"
          >
            <Volume2 className="w-4 h-4 text-black" />
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-black hover:text-white border border-black transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Translation row */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs font-mono uppercase text-zinc-500 mb-1">
          <span>Переклад (UA)</span>
          {pos && <span className="bg-zinc-100 px-1 border border-zinc-400 text-zinc-700">{pos}</span>}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-1 text-sm text-zinc-500 font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Аналіз Gemini...</span>
          </div>
        ) : isEditingTranslation ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border-2 border-black focus:outline-none bg-yellow-50"
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
              className="px-2 py-1 bg-black text-white text-xs font-mono border-2 border-black"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => setIsEditingTranslation(true)}
            className="text-base font-semibold text-zinc-900 cursor-pointer hover:bg-yellow-50 p-1 rounded-none border border-transparent hover:border-black transition-all flex items-center justify-between group"
            title="Клікніть щоб відредагувати переклад"
          >
            <span>{translation || <span className="text-zinc-400 font-normal italic">Немає перекладу</span>}</span>
            <span className="text-[10px] font-mono text-zinc-400 opacity-0 group-hover:opacity-100">змінити</span>
          </div>
        )}

        {explanation && (
          <p className="text-xs text-zinc-600 mt-1 italic leading-tight">
            ℹ️ {explanation}
          </p>
        )}
      </div>

      {/* Synonyms section */}
      {synonyms.length > 0 && (
        <div className="mb-3 pt-2 border-t border-zinc-200">
          <div className="text-[11px] font-mono uppercase text-zinc-500 mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Синоніми (DA):</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {synonyms.slice(0, 4).map((syn, idx) => (
              <button
                key={idx}
                onClick={() => SpeechService.speak(syn, { rate: speechRate })}
                className="text-xs px-1.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 border border-black font-mono transition-colors"
                title="Клікніть для озвучення"
              >
                {syn} 🔊
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status Buttons (LingQ 4 Levels) */}
      <div className="pt-2 border-t-2 border-black">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase text-zinc-500 mb-1.5">
          <span>Рівень вивчення</span>
          <span>Гарячі клавіші [1-3, 0]</span>
        </div>

        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={() => handleSetStatus(0)}
            className={`py-1 text-xs font-mono border-2 border-black transition-all ${
              selectedStatus === 0 ? 'bg-blue-200 font-bold shadow-[1px_1px_0px_0px_#000]' : 'bg-white hover:bg-blue-50'
            }`}
          >
            Нове
          </button>
          <button
            onClick={() => handleSetStatus(1)}
            className={`py-1 text-xs font-mono border-2 border-black transition-all ${
              selectedStatus === 1 ? 'bg-yellow-300 font-bold shadow-[1px_1px_0px_0px_#000]' : 'bg-white hover:bg-yellow-50'
            }`}
          >
            Вчу 1
          </button>
          <button
            onClick={() => handleSetStatus(2)}
            className={`py-1 text-xs font-mono border-2 border-black transition-all ${
              selectedStatus === 2 ? 'bg-yellow-100 font-bold shadow-[1px_1px_0px_0px_#000]' : 'bg-white hover:bg-yellow-50'
            }`}
          >
            Вчу 2
          </button>
          <button
            onClick={() => handleSetStatus(3)}
            className={`py-1 text-xs font-mono border-2 border-black transition-all ${
              selectedStatus === 3 ? 'bg-emerald-300 font-bold shadow-[1px_1px_0px_0px_#000]' : 'bg-white hover:bg-emerald-50'
            }`}
          >
            ✓ Знаю
          </button>
        </div>
      </div>
    </div>
  );
};
