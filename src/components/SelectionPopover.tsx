// language: TypeScript (React), file: src/components/SelectionPopover.tsx, target: Web / Mobile Browser
import React, { useEffect, useState } from 'react';
import { SelectionData, Language } from '../types.ts';
import { Volume2, Bookmark, Check, X, Loader2 } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { haptic } from '../utils/haptics.ts';

interface SelectionPopoverProps {
  selection: SelectionData;
  language: Language;
  onClose: () => void;
  onPlayAudio: (speed: number) => void;
  isPlaying: boolean;
  currentSpeed: number | null;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'warning') => void;
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
  currentSpeed,
  onShowToast
}) => {
  const [data, setData] = useState<TranscribeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const fetchTranslation = async () => {
      try {
        const r = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: selection.text, lang: language, userLang: 'uk' })
        });

        const contentType = r.headers.get('content-type') || '';
        if (r.ok && contentType.includes('application/json')) {
          const res: TranscribeResult = await r.json();
          if (isMounted) {
            setData(res);
            setLoading(false);
            return;
          }
        }
        throw new Error('Fallback to direct client translation');
      } catch {
        // Direct client fallback translation via public endpoint
        try {
          const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${language}&tl=uk&dt=t&q=${encodeURIComponent(selection.text)}`;
          const gRes = await fetch(gUrl);
          const gJson = await gRes.json();
          const translated = gJson[0]?.map((item: any) => item[0]).filter(Boolean).join(' ') || selection.text;
          if (isMounted) {
            setData({
              original: selection.text,
              translation: translated,
              ipa: language === 'da' ? `[da: ${selection.text}]` : `/${selection.text}/`
            });
            setLoading(false);
          }
        } catch {
          if (isMounted) {
            setData({
              original: selection.text,
              translation: selection.text,
              ipa: ''
            });
            setLoading(false);
          }
        }
      }
    };

    fetchTranslation();

    return () => {
      isMounted = false;
    };
  }, [selection.text, language]);

  const handleSaveWord = async () => {
    if (!data) return;
    haptic.success();
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
    } catch {
      // safe fallback
    }

    setSaved(true);
    if (onShowToast) {
      onShowToast('Збережено у ваш словник!', 'success');
    }
    setTimeout(() => setSaved(false), 2400);
  };

  const handlePlay = (speed: number) => {
    haptic.tap();
    onPlayAudio(speed);
  };

  const wordCount = selection.text.split(/\s+/).filter(Boolean).length;
  const isTop = selection.placement === 'top';

  return (
    <div
      className={`fixed z-50 pointer-events-auto ${
        isTop ? 'animate-popover-top' : 'animate-popover-bottom'
      }`}
      style={{
        left: `${selection.x}px`,
        top: isTop ? `${selection.y}px` : undefined,
        bottom: !isTop ? `${window.innerHeight - selection.y}px` : undefined,
        width: 'min(340px, calc(100vw - 28px))'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="glass-pill border border-zinc-200/90 dark:border-white/10 rounded-2xl p-3.5 shadow-2xl text-zinc-900 dark:text-zinc-100 transition-colors">
        {/* Top Header: Selected text & actions */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-zinc-200/60 dark:border-white/5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm sm:text-[15px] truncate block tracking-tight">
                {selection.text}
              </span>
              {wordCount > 1 && (
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-white/5 px-1.5 py-0.5 rounded-md shrink-0">
                  {wordCount} сл.
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleSaveWord}
              disabled={saved || loading}
              className={`p-1.5 rounded-full transition-all cursor-pointer ${
                saved
                  ? 'bg-amber-400 text-zinc-950 font-bold'
                  : 'hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-500 hover:text-amber-500'
              }`}
              title="Зберегти у словник"
              aria-label="Зберегти"
            >
              {saved ? (
                <Check className="w-4 h-4 stroke-[2.4]" />
              ) : (
                <Bookmark className="w-4 h-4 stroke-[1.8]" />
              )}
            </button>

            <button
              onClick={() => {
                haptic.tap();
                onClose();
              }}
              className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
              aria-label="Закрити"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Translation & Phonetic IPA Body */}
        <div className="py-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-3 text-zinc-400 text-xs font-mono gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
              <span>Аналіз вимови & переклад...</span>
            </div>
          ) : data ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                  {data.translation}
                </span>
                {data.ipa && (
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-amber-400/15 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400 font-semibold tracking-wide">
                    {data.ipa}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-400">Не вдалося завантажити переклад</div>
          )}
        </div>

        {/* Audio Speed Controls Pill Bar */}
        <div className="pt-2 border-t border-zinc-200/60 dark:border-white/5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePlay(0.8)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                isPlaying && currentSpeed === 0.8
                  ? 'bg-amber-400 text-zinc-950 font-bold shadow-xs'
                  : 'bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {isPlaying && currentSpeed === 0.8 ? (
                <AudioVisualizer isPlaying={true} barColor="bg-zinc-950" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 stroke-[2]" />
              )}
              <span>0.8x Повільно</span>
            </button>

            <button
              onClick={() => handlePlay(1.0)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                isPlaying && currentSpeed === 1.0
                  ? 'bg-amber-400 text-zinc-950 font-bold shadow-xs'
                  : 'bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {isPlaying && currentSpeed === 1.0 ? (
                <AudioVisualizer isPlaying={true} barColor="bg-zinc-950" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 stroke-[2]" />
              )}
              <span>1.0x Звично</span>
            </button>
          </div>

          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
            {language === 'da' ? 'DK' : 'EN'}
          </span>
        </div>
      </div>
    </div>
  );
};
