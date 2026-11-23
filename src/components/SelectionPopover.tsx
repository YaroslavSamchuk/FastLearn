import React, { useEffect, useState } from 'react';
import { SelectionData, Language } from '../types.ts';
import { Volume2, Bookmark, Check, X, Loader2 } from 'lucide-react';

interface SelectionPopoverProps {
  selection: SelectionData;
  language: Language;
  onClose: () => void;
  onPlayAudio: (speed: number) => void;
  isPlaying: boolean;
  currentSpeed: number | null;
}

interface TranscribeResult {
  original: string;
  translation: string;
  ipa: string;
}

export const SelectionPopover: React.FC<SelectionPopoverProps> = ({
  selection,
  language,
  onClose,
  onPlayAudio,
  isPlaying,
  currentSpeed
}) => {
  const [data, setData] = useState<TranscribeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: selection.text, lang: language, userLang: 'uk' })
    })
      .then(r => r.json())
      .then((res: TranscribeResult) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selection.text, language]);

  const handleSaveWord = async () => {
    if (!data) return;
    try {
      await fetch('/api/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phrase: selection.text,
          translation: data.translation,
          ipa: data.ipa,
          language
        })
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.warn('Word Vault save error');
    }
  };

  const wordCount = selection.text.split(/\s+/).filter(Boolean).length;
  const isTop = selection.placement === 'top';

  return (
    <div
      className={`fixed z-50 pointer-events-auto ${isTop ? 'animate-popover-top' : 'animate-popover-bottom'}`}
      style={{
        left: `${selection.x}px`,
        top: isTop ? `${selection.y}px` : undefined,
        bottom: !isTop ? `${window.innerHeight - selection.y}px` : undefined,
        width: 'min(330px, calc(100vw - 24px))'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-lg p-3.5 shadow-xl dark:shadow-2xl text-zinc-900 dark:text-zinc-100 transition-colors">
        {/* Top bar: Selected phrase + Word count + Actions */}
        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-zinc-950 dark:text-zinc-100 truncate block tracking-tight">
                {selection.text}
              </span>
              {wordCount > 1 && (
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-xs shrink-0">
                  {wordCount}w
                </span>
              )}
            </div>

            {/* IPA Phonetic Transcription */}
            <div className="text-xs font-mono text-amber-600 dark:text-amber-400 tracking-wide mt-1 select-all">
              {loading ? (
                <span className="text-zinc-400 dark:text-zinc-500 text-[11px] flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin inline" /> транскрипція...
                </span>
              ) : (
                data?.ipa || `/${selection.text}/`
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {/* Word Vault Bookmark */}
            <button
              onClick={handleSaveWord}
              title="Зберегти до словника"
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-amber-500 transition-colors cursor-pointer"
            >
              {saved ? <Check className="w-4 h-4 text-emerald-500" /> : <Bookmark className="w-4 h-4" />}
            </button>
            {/* Close button */}
            <button
              onClick={onClose}
              title="Закрити"
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Translation Section */}
        <div className="py-2.5">
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono uppercase tracking-wider mb-1">
            Переклад
          </div>
          <div className="text-sm font-normal text-zinc-800 dark:text-zinc-200 leading-snug">
            {loading ? (
              <span className="text-zinc-400 dark:text-zinc-500 italic text-xs">перекладаємо...</span>
            ) : (
              data?.translation || selection.text
            )}
          </div>
        </div>

        {/* Speed Controls (0.85x and 0.60x) */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
          <button
            onClick={() => onPlayAudio(0.85)}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md border text-xs font-mono transition-all active:scale-95 cursor-pointer ${
              isPlaying && currentSpeed === 0.85
                ? 'border-amber-400 bg-amber-400/15 text-amber-700 dark:text-amber-300'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlaying && currentSpeed === 0.85 ? 'animate-sound-wave text-amber-500' : ''}`} />
            <span>0.85x Швидко</span>
          </button>

          <button
            onClick={() => onPlayAudio(0.60)}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md border text-xs font-mono transition-all active:scale-95 cursor-pointer ${
              isPlaying && currentSpeed === 0.60
                ? 'border-amber-400 bg-amber-400/15 text-amber-700 dark:text-amber-300'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlaying && currentSpeed === 0.60 ? 'animate-sound-wave text-amber-500' : ''}`} />
            <span>0.60x Повільно</span>
          </button>
        </div>
      </div>
    </div>
  );
};
