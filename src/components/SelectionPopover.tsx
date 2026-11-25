// language: TypeScript (React), file: src/components/SelectionPopover.tsx, target: Web / Mobile Browser
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SelectionData, Language } from '../types.ts';
import { Volume2, X, Loader2, RotateCw } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { haptic } from '../utils/haptics.ts';
import { MAX_SELECTION_WORDS } from '../utils/textTokens.ts';
import { log } from '../lib/logger.ts';
import type { TranscribeResult } from '../lib/api.ts';
import {
  createSpeechBatchLoader,
  fetchSpeechAudio,
  getPronunciation,
  isCacheableSpeechAudio,
  translateSelection
} from '../lib/api.ts';
import {
  addDanishPhrasePauses,
  PHRASE_PLAYBACK_SPEEDS,
  toSpeechText
} from '../lib/speech.ts';
import {
  getPrefetchedSpeechAudio,
  loadSpeechAudioVariants,
  seedPrefetchedSpeechAudio
} from '../lib/speechAudioCache.ts';
import {
  getEntryAudioForSpeed,
  getTranslationHistoryEntry,
  matchesEntryVoice,
  saveCachedSpeech,
  updateTranslationHistoryEntry
} from '../lib/translationHistory.ts';

interface SelectionPopoverProps {
  selection: SelectionData;
  language: Language;
  voice: string;
  speeds?: readonly number[];
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
  voice,
  speeds = PHRASE_PLAYBACK_SPEEDS,
  userId,
  onClose,
  onPlayAudio,
  onStopAudio,
  isPlaying,
  playingText,
  currentSpeed
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const phraseSpeeds = Array.from(new Set(speeds.length > 0 ? speeds : PHRASE_PLAYBACK_SPEEDS));
  const phraseSpeedsKey = phraseSpeeds.join(',');
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
      const speechInput = language === 'da'
        ? addDanishPhrasePauses(selection.text)
        : selection.text;
      const speechText = toSpeechText(speechInput);
      const historyAudioText = language === 'da' && speechText ? speechText : selection.text;

      const memoryReadySpeeds = speechText
        ? phraseSpeeds.filter((speed) =>
            Boolean(getPrefetchedSpeechAudio(language, speechText, speed, voice))
          )
        : [];
      if (memoryReadySpeeds.length > 0) {
        setReadyPhraseSpeeds(memoryReadySpeeds);
      }

      const [cached, speechCached] = await Promise.all([
        getTranslationHistoryEntry(userId, language, selection.text).catch((reason: unknown) => {
          log.warn('translation-history', 'Could not read translation cache', {
            error: reason instanceof Error ? reason.message : String(reason)
          });
          return null;
        }),
        speechText && historyAudioText !== selection.text
          ? getTranslationHistoryEntry(userId, language, historyAudioText).catch(() => null)
          : Promise.resolve(null)
      ]);
      if (!active) return;

      const audioEntry = speechCached ?? cached;
      const hasFreshIpa = Boolean(cached?.ipa) && !(language === 'da' && cached!.ipa!.startsWith('/'));
      const base: TranscribeResult = {
        original: selection.text,
        translation: cached?.translation ?? '',
        ipa: hasFreshIpa ? cached?.ipa ?? '' : '',
        sourceLang: language,
        userLang: 'uk'
      };

      const selectionWordCount = selection.text.split(/\s+/).filter(Boolean).length;
      const exceedsWordLimit = selectionWordCount > MAX_SELECTION_WORDS;

      setData(base);
      setLoadingTranslation(!cached?.translation);
      setLoadingPronunciation(!hasFreshIpa && !exceedsWordLimit);
      if (exceedsWordLimit && !hasFreshIpa) {
        setPronunciationError(true);
      }

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

      if (!hasFreshIpa && !exceedsWordLimit) {
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

      if (speechText) {
        const validAudioEntry = matchesEntryVoice(audioEntry, language, voice) ? audioEntry : null;
        const missingSpeeds: number[] = [];

        for (const speed of phraseSpeeds) {
          if (getPrefetchedSpeechAudio(language, speechText, speed, voice)) {
            setReadyPhraseSpeeds((previous) =>
              previous.includes(speed) ? previous : [...previous, speed]
            );
            continue;
          }
          const storedAudio = getEntryAudioForSpeed(validAudioEntry, speed);
          if (storedAudio) {
            seedPrefetchedSpeechAudio(language, speechText, speed, storedAudio, voice);
            setReadyPhraseSpeeds((previous) =>
              previous.includes(speed) ? previous : [...previous, speed]
            );
            continue;
          }
          missingSpeeds.push(speed);
        }

        if (missingSpeeds.length > 0) {
          const loadVariant =
            missingSpeeds.length > 1
              ? createSpeechBatchLoader(speechText, language, missingSpeeds, voice || undefined)
              : (speed: number) => fetchSpeechAudio(speechText, language, speed, undefined, voice || undefined);

          tasks.push(
            loadSpeechAudioVariants(
              language,
              speechText,
              missingSpeeds,
              loadVariant,
              {
                onSpeedReady: (speed, audio) => {
                  if (active) {
                    setReadyPhraseSpeeds((previous) =>
                      previous.includes(speed) ? previous : [...previous, speed]
                    );
                  }
                  if (userId && isCacheableSpeechAudio(audio)) {
                    void saveCachedSpeech(
                      userId,
                      language,
                      historyAudioText,
                      speed,
                      audio,
                      voice
                    ).catch(() => {});
                  }
                },
                onSpeedError: (speed, reason) => {
                  if (reason instanceof DOMException && reason.name === 'AbortError') return;
                  if (active) {
                    setFailedPhraseSpeeds((previous) =>
                      previous.includes(speed) ? previous : [...previous, speed]
                    );
                  }
                  log.warn('audio', 'Could not preload selected phrase audio', {
                    speed,
                    error: reason instanceof Error ? reason.message : String(reason)
                  });
                }
              },
              voice
            )
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
  }, [selection.text, language, voice, phraseSpeedsKey, userId, attempt]);

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
      <div className="animate-popover rounded-md border border-black/[0.14] bg-white text-[#111113] shadow-sm dark:border-white/[0.14] dark:bg-[#141416] dark:text-zinc-100">
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.08] px-4 py-3 dark:border-white/[0.08]">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#111113] dark:text-zinc-50">
              {selection.text}
            </p>
            {wordCount > 1 && (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                {wordCount} слів
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-zinc-400 transition-colors duration-150 hover:bg-black/[0.06] hover:text-[#111113] dark:text-zinc-500 dark:hover:bg-white/[0.08] dark:hover:text-zinc-100"
            title="Закрити"
            aria-label="Закрити панель перекладу"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="space-y-3">
            <section aria-label="Переклад" aria-live="polite">
              {data?.translation ? (
                <p className="text-[14px] leading-snug text-zinc-800 dark:text-zinc-200">
                  {data.translation}
                </p>
              ) : loadingTranslation ? (
                <div className="flex items-center gap-2 py-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                  Переклад…
                </div>
              ) : translationError ? (
                <div className="space-y-2">
                  <p className="text-[12px] leading-relaxed text-red-600 dark:text-red-400">
                    Не вдалося отримати переклад
                  </p>
                  <p className="break-words text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {translationError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAttempt((value) => value + 1)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-black/[0.12] px-2.5 text-[11px] font-medium text-zinc-700 transition-colors duration-150 hover:bg-black/[0.04] dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                  >
                    <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Повторити переклад
                  </button>
                </div>
              ) : (
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
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
                <div className="flex items-center gap-2 py-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                  Транскрипція…
                </div>
              ) : pronunciationError ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    {wordCount > MAX_SELECTION_WORDS
                      ? `Виберіть фразу до ${MAX_SELECTION_WORDS} слів`
                      : 'Транскрипція недоступна'}
                  </p>
                  {wordCount <= MAX_SELECTION_WORDS && (
                    <button
                      type="button"
                      onClick={() => setAttempt((value) => value + 1)}
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] border border-black/[0.12] px-2 text-[11px] font-medium text-zinc-700 transition-colors duration-150 hover:bg-black/[0.04] dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                    >
                      <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Повторити
                    </button>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div
          className="grid gap-2 border-t border-black/[0.08] px-4 py-3 dark:border-white/[0.08]"
          style={{ gridTemplateColumns: `repeat(${phraseSpeeds.length}, minmax(0, 1fr))` }}
        >
          {phraseSpeeds.map((speed) => {
            const active = isCurrentPlaying && currentSpeed === speed;
            return (
              <button
                key={speed}
                type="button"
                onClick={() => handlePlay(speed)}
                className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[4px] border px-2 font-mono text-[12px] font-medium tabular-nums transition-colors duration-150 ${
                  active
                    ? 'border-amber-500 bg-amber-400 text-[#111113]'
                    : 'border-black/[0.1] bg-[#f4f4f2] text-zinc-700 hover:border-black/25 hover:text-[#111113] dark:border-white/[0.1] dark:bg-[#1c1c1f] dark:text-zinc-300 dark:hover:border-white/25 dark:hover:text-zinc-100'
                }`}
                aria-label={`Прослухати виділену фразу зі швидкістю ${speed}×`}
                aria-pressed={active}
              >
                {active ? (
                  <AudioVisualizer isPlaying barColor="bg-[#111113]" />
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
