// language: TypeScript (React), file: src/components/SelectionPopover.tsx, target: Web / Mobile Browser
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SelectionData, Language } from '../types.ts';
import { Volume2, X, Loader2, RotateCw } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { haptic } from '../utils/haptics.ts';
import { log } from '../lib/logger.ts';
import type { TranscribeResult } from '../lib/api.ts';
import {
  fetchSpeechAudio,
  getPronunciation,
  translateSelection
} from '../lib/api.ts';
import { toSpeechText } from '../lib/speech.ts';
import {
  getTranslationHistoryEntry,
  saveCachedSpeech,
  updateTranslationHistoryEntry
} from '../lib/translationHistory.ts';

interface SelectionPopoverProps {
  selection: SelectionData;
  language: Language;
  userId: string;
  onClose: () => void;
  onPlayAudio: (speed: number) => void;
  onStopAudio: () => void;
  isPlaying: boolean;
  playingText?: string;
  currentSpeed: number | null;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const SelectionPopover: React.FC<SelectionPopoverProps> = ({
  selection,
  language,
  userId,
  onClose,
  onPlayAudio,
  onStopAudio,
  isPlaying,
  playingText,
  currentSpeed
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<TranscribeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPronunciation, setLoadingPronunciation] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [style, setStyle] = useState<React.CSSProperties>({
    left: selection.x,
    top: selection.y,
    opacity: 0
  });

  const isCurrentPlaying = isPlaying && playingText === selection.text;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadingPronunciation(true);
    setError(null);
    setData(null);

    const saveHistory = (
      update: Parameters<typeof updateTranslationHistoryEntry>[3]
    ) => updateTranslationHistoryEntry(userId, language, selection.text, update).catch((reason: unknown) => {
      log.warn('translation-history', 'Could not save translation cache entry', {
        error: reason instanceof Error ? reason.message : String(reason)
      });
    });

    const loadSelection = async () => {
      let cached = null;
      try {
        cached = await getTranslationHistoryEntry(userId, language, selection.text);
      } catch (reason) {
        log.warn('translation-history', 'Could not read translation cache', {
          error: reason instanceof Error ? reason.message : String(reason)
        });
      }
      if (!active) return;

      const base: TranscribeResult = {
        original: selection.text,
        translation: cached?.translation ?? '',
        ipa: cached?.ipa ?? '',
        sourceLang: language,
        userLang: 'uk'
      };

      if (cached?.translation) {
        setData(base);
        setLoading(false);
      }

      const tasks: Promise<unknown>[] = [];
      if (!cached?.translation) {
        tasks.push(
          translateSelection(selection.text, language, controller.signal)
            .then(async (translation) => {
              await saveHistory({ translation });
              if (!active) return;
              setData((previous) => ({ ...(previous ?? base), translation }));
              setLoading(false);
            })
            .catch((reason: unknown) => {
              if (reason instanceof DOMException && reason.name === 'AbortError') return;
              if (active) {
                const message = reason instanceof Error ? reason.message : String(reason);
                log.warn('translate', 'Selection translation failed', { message });
                setError(message);
                setLoading(false);
              }
            })
        );
      }

      if (!cached?.ipa) {
        tasks.push(
          getPronunciation(selection.text, language, controller.signal)
            .then(async (ipa) => {
              await saveHistory({ ipa });
              if (active) {
                setData((previous) => ({ ...(previous ?? base), ipa }));
                setLoadingPronunciation(false);
              }
            })
            .catch((reason: unknown) => {
              if (reason instanceof DOMException && reason.name === 'AbortError') return;
              if (active) {
                log.warn('translate', 'Pronunciation lookup failed', {
                  error: reason instanceof Error ? reason.message : String(reason)
                });
                setLoadingPronunciation(false);
              }
            })
        );
      } else {
        setLoadingPronunciation(false);
      }

      const speechText = toSpeechText(selection.text);
      const speechVariants = [
        { speed: 1, cachedAudio: cached?.normalAudio },
        { speed: 0.8, cachedAudio: cached?.slowAudio }
      ];
      for (const variant of speechVariants) {
        if (!speechText || variant.cachedAudio) continue;
        tasks.push(
          fetchSpeechAudio(speechText, language, variant.speed, controller.signal)
            .then((audio) => saveCachedSpeech(
              userId,
              language,
              selection.text,
              variant.speed,
              audio
            ))
            .catch((reason: unknown) => {
              if (reason instanceof DOMException && reason.name === 'AbortError') return;
              log.warn('audio', 'Could not prefetch selected phrase audio', {
                speed: variant.speed,
                error: reason instanceof Error ? reason.message : String(reason)
              });
            })
        );
      }

      void Promise.allSettled(tasks);
    };

    void loadSelection();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selection.text, language, userId, attempt]);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const node = popoverRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [onClose]);

  useLayoutEffect(() => {
    const node = popoverRef.current;
    if (!node) return;

    const margin = 12;
    const positionPopover = () => {
      const rect = node.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const maxLeft = Math.max(margin, viewportWidth - rect.width - margin);
      const left = Math.max(margin, Math.min(selection.x - rect.width / 2, maxLeft));
      const desiredTop = selection.placement === 'top' ? selection.y - rect.height : selection.y;
      const maxTop = Math.max(margin, viewportHeight - rect.height - margin);
      const top = Math.max(margin, Math.min(desiredTop, maxTop));

      setStyle({
        left,
        top,
        maxHeight: `${Math.max(1, viewportHeight - margin * 2)}px`,
        opacity: 1
      });
    };

    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.visualViewport?.addEventListener('resize', positionPopover);

    return () => {
      window.removeEventListener('resize', positionPopover);
      window.visualViewport?.removeEventListener('resize', positionPopover);
    };
  }, [selection, loading, data, error]);

  const handlePlay = () => {
    haptic.tap();
    if (isCurrentPlaying) {
      onStopAudio();
      return;
    }
    onPlayAudio(0.8);
  };

  const wordCount = selection.text.split(/\s+/).filter(Boolean).length;

  return (
    <div
      ref={popoverRef}
      data-selection-popover
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="fixed z-50 max-h-[calc(100dvh-24px)] w-[min(350px,calc(100vw-24px))] overflow-y-auto overscroll-contain transition-[opacity,transform] duration-150 ease-out"
      style={style}
    >
      <div className="animate-popover rounded-2xl border border-stone-200/90 bg-white text-stone-900 shadow-lg shadow-stone-900/10 dark:border-white/[0.1] dark:bg-[#191817] dark:text-stone-100 dark:shadow-black/30">
        <div className="flex items-start justify-between gap-2 border-b border-stone-100 px-4 pt-4 pb-2.5 dark:border-white/[0.07]">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[14px] font-medium leading-snug text-stone-950 dark:text-stone-50">
              {selection.text}
            </p>
            {wordCount > 1 && (
              <p className="mt-0.5 font-mono text-[11px] text-stone-400 dark:text-stone-500">
                {wordCount} слів
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                onClose();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 dark:text-stone-500 dark:hover:bg-white/[0.08] dark:hover:text-stone-200"
              title="Закрити"
              aria-label="Закрити панель перекладу"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-1 text-[12px] text-stone-500 dark:text-stone-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              Переклад і вимова…
            </div>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-[12px] leading-relaxed text-red-600 dark:text-red-400">
                Не вдалося отримати переклад
              </p>
              <p className="break-words text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-white/[0.09] dark:text-stone-300 dark:hover:bg-white/[0.05]"
              >
                <RotateCw className="h-3 w-3" strokeWidth={2} />
                Повторити
              </button>
            </div>
          ) : data ? (
            <div className="space-y-2">
              {data.translation && (
                <p className="text-[14px] leading-snug text-stone-800 dark:text-stone-200">
                  {data.translation}
                </p>
              )}
              {data.ipa && (
                <p className="font-mono text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
                  {data.ipa}
                </p>
              )}
              {!data.ipa && loadingPronunciation && (
                <p className="text-[12px] text-stone-500 dark:text-stone-500">
                  Шукаємо вимову…
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-stone-500">Немає даних</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-4 pt-2.5 pb-4 dark:border-white/[0.07]">
          <button
            type="button"
            onClick={handlePlay}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              isCurrentPlaying
                ? 'bg-amber-400 text-stone-950'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-white/[0.06] dark:text-stone-300 dark:hover:bg-white/[0.1]'
            }`}
          >
            {isCurrentPlaying ? (
              <AudioVisualizer isPlaying barColor="bg-stone-950" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span>{isCurrentPlaying ? 'Зупинити' : 'Прослухати 0.8×'}</span>
          </button>

          <span className="font-mono text-[11px] text-stone-500 dark:text-stone-500">
            {language === 'da' ? 'DA' : 'EN'}
            {currentSpeed ? ` · ${currentSpeed}×` : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
