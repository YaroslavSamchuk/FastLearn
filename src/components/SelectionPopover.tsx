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
import {
  addDanishPhrasePauses,
  PHRASE_PLAYBACK_SPEEDS,
  toSpeechText
} from '../lib/speech.ts';
import {
  getPrefetchedSpeechAudio,
  loadSpeechAudioVariants
} from '../lib/speechAudioCache.ts';
import {
  getTranslationHistoryEntry,
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
  const [loadingTranslation, setLoadingTranslation] = useState(true);
  const [loadingPronunciation, setLoadingPronunciation] = useState(true);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [pronunciationError, setPronunciationError] = useState(false);
  const [readyPhraseSpeeds, setReadyPhraseSpeeds] = useState<number[]>([]);
  const [failedPhraseSpeeds, setFailedPhraseSpeeds] = useState<number[]>([]);
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
    setLoadingTranslation(true);
    setLoadingPronunciation(true);
    setTranslationError(null);
    setPronunciationError(false);
    setReadyPhraseSpeeds([]);
    setFailedPhraseSpeeds([]);
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

      setData(base);
      setLoadingTranslation(!cached?.translation);
      setLoadingPronunciation(!cached?.ipa);

      const tasks: Promise<unknown>[] = [];
      if (!cached?.translation) {
        tasks.push(
          translateSelection(selection.text, language, controller.signal)
            .then((translation) => {
              if (!active) return;
              setData((previous) => ({ ...(previous ?? base), translation }));
              setLoadingTranslation(false);
              void saveHistory({ translation });
            })
            .catch((reason: unknown) => {
              if (reason instanceof DOMException && reason.name === 'AbortError') return;
              if (active) {
                const message = reason instanceof Error ? reason.message : String(reason);
                log.warn('translate', 'Selection translation failed', { message });
                setTranslationError(message);
                setLoadingTranslation(false);
              }
            })
        );
      }

      if (!cached?.ipa) {
        tasks.push(
          getPronunciation(selection.text, language, controller.signal)
            .then((ipa) => {
              if (!active) return;
              if (!ipa.trim()) {
                setPronunciationError(true);
                setLoadingPronunciation(false);
                return;
              }
              setData((previous) => ({ ...(previous ?? base), ipa }));
              setLoadingPronunciation(false);
              void saveHistory({ ipa });
            })
            .catch((reason: unknown) => {
              if (reason instanceof DOMException && reason.name === 'AbortError') return;
              if (active) {
                log.warn('translate', 'Pronunciation lookup failed', {
                  error: reason instanceof Error ? reason.message : String(reason)
                });
                setPronunciationError(true);
                setLoadingPronunciation(false);
              }
            })
        );
      } else {
        setLoadingPronunciation(false);
      }

      const speechInput = language === 'da'
        ? addDanishPhrasePauses(selection.text)
        : selection.text;
      const speechText = toSpeechText(speechInput);
      if (speechText) {
        const allSpeedsReady = PHRASE_PLAYBACK_SPEEDS.every((speed) =>
          getPrefetchedSpeechAudio(language, speechText, speed)
        );
        if (allSpeedsReady) {
          setReadyPhraseSpeeds([...PHRASE_PLAYBACK_SPEEDS]);
        } else {
          tasks.push(
            loadSpeechAudioVariants(
              language,
              speechText,
              PHRASE_PLAYBACK_SPEEDS,
              (speed) => fetchSpeechAudio(speechText, language, speed, controller.signal)
            )
              .then(() => {
                if (active) setReadyPhraseSpeeds([...PHRASE_PLAYBACK_SPEEDS]);
              })
              .catch((reason: unknown) => {
                if (reason instanceof DOMException && reason.name === 'AbortError') return;
                if (active) setFailedPhraseSpeeds([...PHRASE_PLAYBACK_SPEEDS]);
                log.warn('audio', 'Could not preload selected phrase audio', {
                  error: reason instanceof Error ? reason.message : String(reason)
                });
              })
          );
        }
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
  }, [selection, loadingTranslation, loadingPronunciation, data, translationError, pronunciationError]);

  const handlePlay = (speed: number) => {
    haptic.tap();
    if (isCurrentPlaying && currentSpeed === speed) {
      onStopAudio();
      return;
    }
    onPlayAudio(speed);
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
          <div className="space-y-2.5">
            <section aria-label="Переклад" aria-live="polite">
              {data?.translation ? (
                <p className="text-[14px] leading-snug text-stone-800 dark:text-stone-200">
                  {data.translation}
                </p>
              ) : loadingTranslation ? (
                <div className="flex items-center gap-2 py-1 text-[12px] text-stone-500 dark:text-stone-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  Перекладаємо…
                </div>
              ) : translationError ? (
                <div className="space-y-1.5">
                  <p className="text-[12px] leading-relaxed text-red-600 dark:text-red-400">
                    Не вдалося отримати переклад
                  </p>
                  <p className="break-words text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                    {translationError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAttempt((value) => value + 1)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-white/[0.09] dark:text-stone-300 dark:hover:bg-white/[0.05]"
                  >
                    <RotateCw className="h-3 w-3" strokeWidth={2} />
                    Повторити переклад
                  </button>
                </div>
              ) : (
                <p className="text-[12px] text-stone-500 dark:text-stone-500">
                  Переклад недоступний
                </p>
              )}
            </section>

            <section aria-label="Транскрипція" aria-live="polite">
              {data?.ipa ? (
                <p className="font-mono text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
                  {data.ipa}
                </p>
              ) : loadingPronunciation ? (
                <div className="flex items-center gap-2 py-1 text-[12px] text-stone-500 dark:text-stone-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  Шукаємо транскрипцію…
                </div>
              ) : pronunciationError ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] text-stone-500 dark:text-stone-500">
                    {wordCount > 20
                      ? 'Виберіть фразу до 20 слів'
                      : 'Транскрипція недоступна'}
                  </p>
                  {wordCount <= 20 && (
                    <button
                      type="button"
                      onClick={() => setAttempt((value) => value + 1)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-white/[0.09] dark:text-stone-300 dark:hover:bg-white/[0.05]"
                    >
                      <RotateCw className="h-3 w-3" strokeWidth={2} />
                      Повторити
                    </button>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-stone-100 px-4 pt-3 pb-4 dark:border-white/[0.07]">
          {PHRASE_PLAYBACK_SPEEDS.map((speed) => {
            const active = isCurrentPlaying && currentSpeed === speed;
            return (
              <button
                key={speed}
                type="button"
                onClick={() => handlePlay(speed)}
                className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors ${
                  active
                    ? 'bg-amber-400 text-stone-950'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-white/[0.06] dark:text-stone-300 dark:hover:bg-white/[0.1]'
                }`}
                aria-label={`Прослухати виділену фразу зі швидкістю ${speed}×`}
                aria-pressed={active}
              >
                {active ? (
                  <AudioVisualizer isPlaying barColor="bg-stone-950" />
                ) : !readyPhraseSpeeds.includes(speed) && !failedPhraseSpeeds.includes(speed) ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                )}
                <span>{speed}×</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
