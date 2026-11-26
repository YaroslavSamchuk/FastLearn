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
  deleteTranslationHistoryEntryByKey,
  getEntryAudioForSpeed,
  getTranslationHistoryEntry,
  matchesEntryVoice,
  peekCachedTranslationHistoryEntry,
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
    ) =>
      updateTranslationHistoryEntry(userId, language, selection.text, {
        kind: 'selection',
        ...update
      }).catch((reason: unknown) => {
        log.warn('translation-history', 'Could not save translation cache entry', {
          error: reason instanceof Error ? reason.message : String(reason)
        });
      });

    const loadSelection = async () => {
      const speechInput =
        language === 'da' ? addDanishPhrasePauses(selection.text) : selection.text;
      const speechText = toSpeechText(speechInput, language);

      const memoryReadySpeeds = speechText
        ? phraseSpeeds.filter((speed) =>
            Boolean(getPrefetchedSpeechAudio(language, speechText, speed, voice))
          )
        : [];
      if (memoryReadySpeeds.length > 0) {
        setReadyPhraseSpeeds(memoryReadySpeeds);
      }

      const readCacheWithTimeout = <T,>(
        promise: Promise<T | null>,
        timeoutMs = 15
      ): Promise<T | null> =>
        Promise.race([
          promise,
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs))
        ]);

      const syncCached = peekCachedTranslationHistoryEntry(userId, language, selection.text);
      const primaryEntryPromise = syncCached
        ? Promise.resolve(syncCached)
        : getTranslationHistoryEntry(userId, language, selection.text, { touch: true }).catch(
            (reason: unknown) => {
              log.warn('translation-history', 'Could not read translation cache', {
                error: reason instanceof Error ? reason.message : String(reason)
              });
              return null;
            }
          );

      const cached = syncCached ?? (await readCacheWithTimeout(primaryEntryPromise, 15));
      if (!active) return;

      if (syncCached) {
        void getTranslationHistoryEntry(userId, language, selection.text, { touch: true }).catch(() => {});
      }

      const hasFreshIpa =
        Boolean(cached?.ipa) &&
        cached?.ipaVersion === 2 &&
        !(language === 'da' && cached!.ipa!.startsWith('/'));
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

      let resolvedTranslation = Boolean(cached?.translation);
      if (!cached && !syncCached) {
        void primaryEntryPromise.then((lateCached) => {
          if (!active || !lateCached?.translation || resolvedTranslation) return;
          resolvedTranslation = true;
          setData((previous) => ({ ...(previous ?? base), translation: lateCached.translation! }));
          setLoadingTranslation(false);
        });
      }

      const tasks: Promise<unknown>[] = [];
      if (!cached?.translation) {
        tasks.push(
          translateSelection(selection.text, language, controller.signal)
            .then((translation) => {
              if (!active || resolvedTranslation) return;
              resolvedTranslation = true;
              setData((previous) => ({ ...(previous ?? base), translation }));
              setLoadingTranslation(false);
              void saveHistory({ translation });
            })
            .catch((reason: unknown) => {
              if (reason instanceof DOMException && reason.name === 'AbortError') return;
              if (active && !resolvedTranslation) {
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
              void saveHistory({ ipa, ipaVersion: 2 });
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
        const legacySpeechCached =
          !syncCached && speechText !== selection.text
            ? await readCacheWithTimeout(
                getTranslationHistoryEntry(userId, language, speechText).catch(() => null),
                20
              )
            : null;
        if (!active) return;

        const primaryAudioEntry = matchesEntryVoice(cached, language, voice) ? cached : null;
        const legacyAudioEntry = matchesEntryVoice(legacySpeechCached, language, voice)
          ? legacySpeechCached
          : null;
        const missingSpeeds: number[] = [];
        let migratedFromLegacy = false;

        for (const speed of phraseSpeeds) {
          if (getPrefetchedSpeechAudio(language, speechText, speed, voice)) {
            setReadyPhraseSpeeds((previous) =>
              previous.includes(speed) ? previous : [...previous, speed]
            );
            continue;
          }

          const storedAudio =
            getEntryAudioForSpeed(primaryAudioEntry, speed) ??
            getEntryAudioForSpeed(legacyAudioEntry, speed);

          if (storedAudio) {
            seedPrefetchedSpeechAudio(language, speechText, speed, storedAudio, voice);
            setReadyPhraseSpeeds((previous) =>
              previous.includes(speed) ? previous : [...previous, speed]
            );
            // Migrate legacy separated Danish audio into the unified selection entry
            if (!getEntryAudioForSpeed(primaryAudioEntry, speed) && userId) {
              migratedFromLegacy = true;
              void saveCachedSpeech(userId, language, selection.text, speed, storedAudio, voice, {
                kind: 'selection'
              }).catch(() => {});
            }
            continue;
          }
          missingSpeeds.push(speed);
        }

        if (migratedFromLegacy && legacySpeechCached?.key && !legacySpeechCached.translation && !legacySpeechCached.ipa) {
          void deleteTranslationHistoryEntryByKey(legacySpeechCached.key).catch(() => {});
        }

        if (missingSpeeds.length > 0) {
          const loadVariant = (speed: number) =>
            fetchSpeechAudio(speechText, language, speed, controller.signal, voice || undefined);

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
                      selection.text,
                      speed,
                      audio,
                      voice,
                      { kind: 'selection' }
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

    const gap = 8;
    const positionPopover = () => {
      const rect = node.getBoundingClientRect();
      const vv = window.visualViewport;
      const viewportWidth = vv?.width ?? window.innerWidth;
      const viewportHeight = vv?.height ?? window.innerHeight;
      const vvLeft = vv?.offsetLeft ?? 0;
      const vvTop = vv?.offsetTop ?? 0;
      const margin = viewportWidth < 400 ? 10 : 12;

      const minLeft = vvLeft + margin;
      const maxLeft = Math.max(minLeft, vvLeft + viewportWidth - rect.width - margin);
      const left = Math.max(minLeft, Math.min(selection.x - rect.width / 2, maxLeft));

      const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? vvTop + 48;
      const topSafeMin = Math.max(vvTop + margin, headerBottom + 6);
      const bottomSafeMax = vvTop + viewportHeight - margin;
      const spaceAbove = selection.anchorTop - topSafeMin;
      const spaceBelow = bottomSafeMax - selection.anchorBottom;

      let desiredTop: number;
      if (selection.placement === 'top') {
        if (spaceAbove >= rect.height + gap || spaceAbove >= spaceBelow) {
          desiredTop = selection.anchorTop - rect.height - gap;
        } else {
          desiredTop = selection.anchorBottom + gap;
        }
      } else {
        if (spaceBelow >= rect.height + gap || spaceBelow >= spaceAbove) {
          desiredTop = selection.anchorBottom + gap;
        } else {
          desiredTop = selection.anchorTop - rect.height - gap;
        }
      }

      const maxTop = Math.max(topSafeMin, bottomSafeMax - rect.height);
      const top = Math.max(topSafeMin, Math.min(desiredTop, maxTop));

      setStyle({
        left,
        top,
        maxHeight: `${Math.max(120, bottomSafeMax - top)}px`,
        opacity: 1
      });
    };

    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.visualViewport?.addEventListener('resize', positionPopover);
    window.visualViewport?.addEventListener('scroll', positionPopover);

    return () => {
      window.removeEventListener('resize', positionPopover);
      window.visualViewport?.removeEventListener('resize', positionPopover);
      window.visualViewport?.removeEventListener('scroll', positionPopover);
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
      className="fixed z-50 max-h-[calc(var(--app-height,100dvh)-20px)] w-[min(340px,calc(100vw-20px))] overflow-y-auto overscroll-contain transition-opacity duration-150 ease-unslop sm:max-h-[calc(var(--app-height,100dvh)-24px)] sm:w-[min(350px,calc(100vw-24px))]"
      style={style}
    >
      <div className="animate-popover rounded-xl border border-black/[0.1] bg-white text-[#1c1917] shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:border-white/[0.1] dark:bg-[#1c1a18] dark:text-[#efede8] dark:shadow-none">
        <div className="flex items-start justify-between gap-2.5 border-b border-black/[0.08] px-3.5 py-2.5 dark:border-white/[0.08] sm:gap-3 sm:px-4 sm:py-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1c1917] dark:text-[#efede8]">
              {selection.text}
            </p>
            {wordCount > 1 && (
              <p className="mt-1 font-mono text-[12px] tabular-nums text-[#736d65] dark:text-[#8a847c]">
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
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-black/[0.05] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:bg-white/[0.06] dark:hover:text-[#efede8]"
            title="Закрити"
            aria-label="Закрити панель перекладу"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3">
          <div className="space-y-3">
            <section aria-label="Переклад" aria-live="polite">
              {data?.translation ? (
                <p className="text-[14px] leading-snug text-[#1c1917] dark:text-[#efede8]">
                  {data.translation}
                </p>
              ) : loadingTranslation ? (
                <div className="flex items-center gap-2 py-1 text-[13px] text-[#736d65] dark:text-[#8a847c]">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                  Переклад…
                </div>
              ) : translationError ? (
                <div className="space-y-2">
                  <p className="text-[13px] leading-relaxed text-[#dc2626] dark:text-[#e5484d]">
                    Не вдалося отримати переклад
                  </p>
                  <p className="break-words text-[12px] leading-relaxed text-[#736d65] dark:text-[#8a847c]">
                    {translationError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAttempt((value) => value + 1)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.1] px-3 text-[12px] font-medium text-[#57534e] transition-colors duration-150 ease-unslop hover:bg-black/[0.04] hover:text-[#1c1917] dark:border-white/[0.1] dark:text-[#a8a29a] dark:hover:bg-white/[0.05] dark:hover:text-[#efede8]"
                  >
                    <RotateCw className="h-4 w-4" strokeWidth={1.5} />
                    Повторити переклад
                  </button>
                </div>
              ) : (
                <p className="text-[13px] text-[#736d65] dark:text-[#8a847c]">
                  Переклад недоступний
                </p>
              )}
            </section>

            <section aria-label="Транскрипція" aria-live="polite">
              {data?.ipa ? (
                <p className="font-mono text-[13px] leading-relaxed text-amber-700 dark:text-amber-400">
                  {data.ipa}
                </p>
              ) : loadingPronunciation ? (
                <div className="flex items-center gap-2 py-1 text-[13px] text-[#736d65] dark:text-[#8a847c]">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                  Транскрипція…
                </div>
              ) : pronunciationError ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] text-[#736d65] dark:text-[#8a847c]">
                    {wordCount > MAX_SELECTION_WORDS
                      ? `Виберіть фразу до ${MAX_SELECTION_WORDS} слів`
                      : 'Транскрипція недоступна'}
                  </p>
                  {wordCount <= MAX_SELECTION_WORDS && (
                    <button
                      type="button"
                      onClick={() => setAttempt((value) => value + 1)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.1] px-2.5 text-[12px] font-medium text-[#57534e] transition-colors duration-150 ease-unslop hover:bg-black/[0.04] hover:text-[#1c1917] dark:border-white/[0.1] dark:text-[#a8a29a] dark:hover:bg-white/[0.05] dark:hover:text-[#efede8]"
                    >
                      <RotateCw className="h-4 w-4" strokeWidth={1.5} />
                      Повторити
                    </button>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div
          className="grid gap-2 border-t border-black/[0.08] p-2 dark:border-white/[0.08]"
          style={{ gridTemplateColumns: `repeat(${phraseSpeeds.length}, minmax(0, 1fr))` }}
        >
          {phraseSpeeds.map((speed) => {
            const active = isCurrentPlaying && currentSpeed === speed;
            return (
              <button
                key={speed}
                type="button"
                onClick={() => handlePlay(speed)}
                className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 font-mono text-[12px] font-medium tabular-nums transition-[background-color,border-color,color,transform] duration-150 ease-unslop active:scale-[0.98] sm:h-9 ${
                  active
                    ? 'border-amber-500 bg-amber-500 text-[#1c1917]'
                    : 'border-black/[0.08] bg-[#f6f5f1] text-[#57534e] hover:border-black/20 hover:text-[#1c1917] dark:border-white/[0.08] dark:bg-[#262421] dark:text-[#a8a29a] dark:hover:border-white/20 dark:hover:text-[#efede8]'
                }`}
                aria-label={`Прослухати виділену фразу зі швидкістю ${speed}×`}
                aria-pressed={active}
              >
                {active ? (
                  <AudioVisualizer isPlaying barColor="bg-[#1c1917]" />
                ) : !readyPhraseSpeeds.includes(speed) && !failedPhraseSpeeds.includes(speed) ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Volume2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
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
