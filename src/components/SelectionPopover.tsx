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

  const wordCount = selection.text.split(/\s+/).length;

  return (
    <div
      className="fixed z-50 transform -translate-x-1/2 pointer-events-auto"
      style={{
        left: `${selection.x}px`,
        top: selection.placement === 'top' ? `${selection.y}px` : undefined,
        bottom: selection.placement === 'bottom' ? `${window.innerHeight - selection.y}px` : undefined,
        transform: selection.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        width: 'min(330px, calc(100vw - 32px))'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-[#121215] border border-white/20 rounded-lg p-3.5 shadow-2xl backdrop-blur-md text-[#f4f4f5]">
        {/* Top bar: Selected phrase + Word count + Actions */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm text-[#f4f4f5] truncate block">
                {selection.text}
              </span>
              {wordCount > 1 && (
                <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-1 py-0.5 rounded">
                  {wordCount}w
                </span>
              )}
            </div>
            {/* IPA Phonetic Transcription */}
            <div className="text-xs font-mono text-amber-400/90 tracking-wide mt-0.5 select-all">
              {loading ? (
                <span className="text-zinc-500 text-[11px] flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin inline" /> transcription...
                </span>
              ) : (
                data?.ipa || `/${selection.text}/`
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Word Vault Bookmark */}
            <button
              onClick={handleSaveWord}
              title="Save to Word Vault"
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-amber-400 transition-colors"
            >
              {saved ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Bookmark className="w-3.5 h-3.5" />}
            </button>
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Translation Section */}
        <div className="py-2.5">
          <div className="text-xs text-zinc-400 font-mono mb-0.5 uppercase tracking-wider text-[10px]">
            Переклад
          </div>
          <div className="text-sm font-normal text-zinc-100 leading-snug">
            {loading ? (
              <span className="text-zinc-500 italic text-xs">перекладаємо...</span>
            ) : (
              data?.translation || selection.text
            )}
          </div>
        </div>

        {/* Speed Controls (0.85x and 0.60x) */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
          <button
            onClick={() => onPlayAudio(0.85)}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded border text-xs font-mono transition-all active:scale-95 ${
              isPlaying && currentSpeed === 0.85
                ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300'
            }`}
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlaying && currentSpeed === 0.85 ? 'animate-pulse' : ''}`} />
            <span>0.85x</span>
          </button>

          <button
            onClick={() => onPlayAudio(0.60)}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded border text-xs font-mono transition-all active:scale-95 ${
              isPlaying && currentSpeed === 0.60
                ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300'
            }`}
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlaying && currentSpeed === 0.60 ? 'animate-pulse' : ''}`} />
            <span>0.60x</span>
          </button>
        </div>
      </div>
    </div>
  );
};
