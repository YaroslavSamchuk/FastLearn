// language: TypeScript (React), file: src/components/SettingsModal.tsx, target: Web / Mobile Browser
import React, { useEffect, useState } from 'react';
import { User, Language, UserMemories, VoiceMap, PlaybackSpeedMap, PlaybackSpeedsTuple } from '../types.ts';
import { X, LogOut, Globe, Brain, Plus, Trash2, Check, Volume2, Minus, RotateCcw } from 'lucide-react';
import {
  DEFAULT_PLAYBACK_SPEEDS,
  MAX_PLAYBACK_SPEED,
  MIN_PLAYBACK_SPEED,
  PLAYBACK_SPEED_STEP,
  TTS_VOICES,
  normalizeSpeedValue,
  resolveVoice
} from '../../server/ttsConfig.js';
import { haptic } from '../utils/haptics.ts';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { UserAvatar } from './UserAvatar.tsx';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isLoggedIn: boolean;
  onLogin: () => void;
  currentLanguage: Language;
  onUpdateLanguage: (lang: Language) => void;
  voices: VoiceMap;
  onUpdateVoice: (lang: Language, voice: string) => void;
  playbackSpeeds: PlaybackSpeedMap;
  onUpdatePlaybackSpeeds: (lang: Language, speeds: PlaybackSpeedsTuple) => void;
  onPreviewVoice?: (lang: Language, voice: string) => void;
  isPreviewPlaying?: boolean;
  onLogout: () => void;
  memories: UserMemories;
  onMemoryUpdate: (
    scope: 'global' | 'da' | 'en',
    action: 'add' | 'delete',
    value: string | number
  ) => void;
}

type SettingsTab = 'general' | 'memory';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  isLoggedIn,
  onLogin,
  currentLanguage,
  onUpdateLanguage,
  voices,
  onUpdateVoice,
  playbackSpeeds,
  onUpdatePlaybackSpeeds,
  onPreviewVoice,
  isPreviewPlaying = false,
  onLogout,
  memories,
  onMemoryUpdate
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [memoryScope, setMemoryScope] = useState<'global' | 'da' | 'en'>('global');
  const [newFact, setNewFact] = useState('');

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frameId);
    }

    setIsVisible(false);
    const timer = window.setTimeout(() => setShouldRender(false), 180);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isLoggedIn && activeTab === 'memory') setActiveTab('general');
  }, [isLoggedIn, activeTab]);

  if (!shouldRender) return null;

  const currentFactList = memories[memoryScope] ?? [];
  const voiceOptions = TTS_VOICES[currentLanguage];
  const activeVoice = resolveVoice(currentLanguage, voices[currentLanguage]);
  const defaultSpeeds = DEFAULT_PLAYBACK_SPEEDS[currentLanguage];
  const activeSpeeds: PlaybackSpeedsTuple = playbackSpeeds[currentLanguage] ?? defaultSpeeds;
  const hasCustomSpeeds = activeSpeeds.some((speed, index) => speed !== defaultSpeeds[index]);

  const handleSpeedSlotChange = (index: 0 | 1 | 2, nextRaw: number) => {
    const nextValue = normalizeSpeedValue(nextRaw, activeSpeeds[index]);
    if (nextValue === activeSpeeds[index]) return;
    const updated: PlaybackSpeedsTuple = [...activeSpeeds] as PlaybackSpeedsTuple;
    updated[index] = nextValue;
    onUpdatePlaybackSpeeds(currentLanguage, updated);
  };

  const handleResetSpeeds = () => {
    if (!hasCustomSpeeds) return;
    haptic.tap();
    onUpdatePlaybackSpeeds(currentLanguage, [...defaultSpeeds] as PlaybackSpeedsTuple);
  };

  const handleAddFact = (event: React.FormEvent) => {
    event.preventDefault();
    const fact = newFact.trim();
    if (!fact) return;
    haptic.impact();
    onMemoryUpdate(memoryScope, 'add', fact);
    setNewFact('');
  };

  const handleDeleteFact = (index: number) => {
    const fact = currentFactList[index];
    if (!fact) return;
    if (!window.confirm(`Видалити факт «${fact.slice(0, 60)}»?`)) return;
    haptic.warning();
    onMemoryUpdate(memoryScope, 'delete', index);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 select-none sm:items-center sm:p-6">
      <div
        className={`fixed inset-0 bg-black/45 transition-opacity duration-200 dark:bg-black/75 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          haptic.tap();
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 flex h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-md border border-black/[0.14] bg-[#f4f4f2] text-[#111113] transition-[opacity,transform] duration-200 dark:border-white/[0.14] dark:bg-[#101012] dark:text-zinc-100 sm:h-auto sm:max-h-[86dvh] sm:rounded-md ${
          isVisible ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-3 opacity-0 sm:scale-[0.98]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Налаштування"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.09] bg-white px-4 dark:border-white/[0.09] dark:bg-[#141416] sm:px-5">
          <h2 className="text-[14px] font-medium tracking-[-0.01em]">Налаштування</h2>
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-zinc-500 transition-colors hover:bg-[#eaeae7] hover:text-[#111113] dark:text-zinc-400 dark:hover:bg-[#1c1c1f] dark:hover:text-zinc-100"
            aria-label="Закрити налаштування"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex shrink-0 border-b border-black/[0.09] bg-white px-4 dark:border-white/[0.09] dark:bg-[#141416] sm:px-5">
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              setActiveTab('general');
            }}
            className={`relative flex flex-1 items-center justify-center gap-2 border-b-2 py-2.5 text-[12px] font-medium transition-colors ${
              activeTab === 'general'
                ? 'border-amber-500 text-[#111113] dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-[#111113] dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
            aria-pressed={activeTab === 'general'}
          >
            <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
            Загальні
          </button>

          {isLoggedIn && (
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                setActiveTab('memory');
              }}
              className={`relative flex flex-1 items-center justify-center gap-2 border-b-2 py-2.5 text-[12px] font-medium transition-colors ${
                activeTab === 'memory'
                  ? 'border-amber-500 text-[#111113] dark:text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-[#111113] dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
              aria-pressed={activeTab === 'memory'}
            >
              <Brain className="h-3.5 w-3.5" strokeWidth={1.75} />
              Пам’ять
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {activeTab === 'general' ? (
            <div className="space-y-4">
              <section className="rounded-md border border-black/[0.1] bg-white p-4 dark:border-white/[0.1] dark:bg-[#141416]">
                <h3 className="text-[12px] font-medium text-[#111113] dark:text-zinc-100">
                  Мова практики
                </h3>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'da', title: 'Dansk', hint: 'Данська' },
                      { value: 'en', title: 'English', hint: 'Англійська' }
                    ] as const
                  ).map((option) => {
                    const selected = currentLanguage === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          haptic.tap();
                          onUpdateLanguage(option.value);
                        }}
                        className={`flex items-center justify-between rounded-[4px] border px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? 'border-black/[0.2] border-l-2 border-l-amber-500 bg-[#f4f4f2] text-[#111113] dark:border-white/[0.2] dark:border-l-amber-500 dark:bg-[#1c1c1f] dark:text-zinc-100'
                            : 'border-black/[0.09] text-zinc-700 hover:border-black/[0.18] hover:bg-[#f4f4f2]/60 dark:border-white/[0.09] dark:text-zinc-300 dark:hover:border-white/[0.16] dark:hover:bg-[#1c1c1f]/50'
                        }`}
                        aria-pressed={selected}
                      >
                        <span>
                          <span className="block text-[13px] font-medium">{option.title}</span>
                          <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-500">
                            {option.hint}
                          </span>
                        </span>
                        {selected && (
                          <Check
                            className="h-4 w-4 text-amber-600 dark:text-amber-400"
                            strokeWidth={1.75}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-black/[0.08] pt-3.5 dark:border-white/[0.08]">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-[12px] font-medium text-[#111113] dark:text-zinc-100">
                      Голос озвучки · {currentLanguage === 'da' ? 'Dansk' : 'English'}
                    </h4>
                    {isLoggedIn && onPreviewVoice && (
                      <button
                        type="button"
                        onClick={() => {
                          haptic.tap();
                          onPreviewVoice(currentLanguage, activeVoice);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-[4px] border border-black/[0.09] px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-[#f4f4f2] hover:text-[#111113] dark:border-white/[0.09] dark:text-zinc-400 dark:hover:bg-[#1c1c1f] dark:hover:text-zinc-100"
                        aria-label="Прослухати вибраний голос"
                      >
                        {isPreviewPlaying ? (
                          <AudioVisualizer isPlaying barColor="bg-amber-600 dark:bg-amber-400" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        )}
                        <span>{isPreviewPlaying ? 'Зупинити' : 'Перевірити'}</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {voiceOptions.map((option) => {
                      const selected = activeVoice === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            haptic.tap();
                            onUpdateVoice(currentLanguage, option.id);
                          }}
                          className={`flex items-center justify-between rounded-[4px] border px-3 py-2 text-left transition-colors ${
                            selected
                              ? 'border-black/[0.2] border-l-2 border-l-amber-500 bg-[#f4f4f2] text-[#111113] dark:border-white/[0.2] dark:border-l-amber-500 dark:bg-[#1c1c1f] dark:text-zinc-100'
                              : 'border-black/[0.09] text-zinc-700 hover:border-black/[0.18] hover:bg-[#f4f4f2]/60 dark:border-white/[0.09] dark:text-zinc-300 dark:hover:border-white/[0.16] dark:hover:bg-[#1c1c1f]/50'
                          }`}
                          aria-pressed={selected}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium">{option.label}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-500">
                              {option.hint}
                            </span>
                          </span>
                          {selected && (
                            <Check
                              className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                              strokeWidth={1.75}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 border-t border-black/[0.08] pt-3.5 dark:border-white/[0.08]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-[12px] font-medium text-[#111113] dark:text-zinc-100">
                        Швидкості озвучки · {currentLanguage === 'da' ? 'Dansk' : 'English'}
                      </h4>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                        Від {MAX_PLAYBACK_SPEED}× до {MIN_PLAYBACK_SPEED}× · перша вмикається одразу
                      </p>
                    </div>
                    {hasCustomSpeeds && (
                      <button
                        type="button"
                        onClick={handleResetSpeeds}
                        className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border border-black/[0.09] px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-[#f4f4f2] hover:text-[#111113] dark:border-white/[0.09] dark:text-zinc-400 dark:hover:bg-[#1c1c1f] dark:hover:text-zinc-100"
                        aria-label="Скинути швидкості до стандартних"
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
                        <span>Скинути</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-2.5 space-y-2">
                    {([0, 1, 2] as const).map((slotIndex) => {
                      const speed = activeSpeeds[slotIndex];
                      const slotLabel = slotIndex === 0 ? 'Швидкість 1' : slotIndex === 1 ? 'Швидкість 2' : 'Швидкість 3';
                      const canDecrease = speed > MIN_PLAYBACK_SPEED + 1e-6;
                      const canIncrease = speed < MAX_PLAYBACK_SPEED - 1e-6;
                      return (
                        <div
                          key={slotIndex}
                          className="rounded-[4px] border border-black/[0.09] bg-[#f4f4f2]/60 px-3 py-2.5 dark:border-white/[0.09] dark:bg-[#101012]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-[12px] font-medium text-zinc-800 dark:text-zinc-200">
                              <span>{slotLabel}</span>
                              {slotIndex === 0 && (
                                <span className="rounded-[2px] border border-amber-500/35 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-700 dark:border-amber-400/30 dark:text-amber-400">
                                  Авто
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[12px] font-medium tabular-nums text-amber-700 dark:text-amber-400">
                              {speed}×
                            </span>
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!canDecrease}
                              onClick={() => {
                                haptic.tap();
                                handleSpeedSlotChange(slotIndex, speed - PLAYBACK_SPEED_STEP);
                              }}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-black/[0.12] bg-white text-zinc-600 transition-colors hover:bg-[#eaeae7] hover:text-[#111113] disabled:opacity-35 dark:border-white/[0.12] dark:bg-[#141416] dark:text-zinc-300 dark:hover:bg-[#1c1c1f] dark:hover:text-zinc-100"
                              aria-label={`Зменшити ${slotLabel}`}
                            >
                              <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>

                            <input
                              type="range"
                              min={MIN_PLAYBACK_SPEED}
                              max={MAX_PLAYBACK_SPEED}
                              step={PLAYBACK_SPEED_STEP}
                              value={speed}
                              onChange={(event) =>
                                handleSpeedSlotChange(slotIndex, Number.parseFloat(event.target.value))
                              }
                              className="h-1 w-full cursor-pointer accent-amber-600 dark:accent-amber-500"
                              aria-label={slotLabel}
                            />

                            <button
                              type="button"
                              disabled={!canIncrease}
                              onClick={() => {
                                haptic.tap();
                                handleSpeedSlotChange(slotIndex, speed + PLAYBACK_SPEED_STEP);
                              }}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-black/[0.12] bg-white text-zinc-600 transition-colors hover:bg-[#eaeae7] hover:text-[#111113] disabled:opacity-35 dark:border-white/[0.12] dark:bg-[#141416] dark:text-zinc-300 dark:hover:bg-[#1c1c1f] dark:hover:text-zinc-100"
                              aria-label={`Збільшити ${slotLabel}`}
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-black/[0.1] bg-white p-4 dark:border-white/[0.1] dark:bg-[#141416]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {isLoggedIn && user ? (
                      <>
                        <UserAvatar name={user.name} src={user.avatar} size={34} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{user.name}</p>
                          <p className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                            {user.email}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <p className="text-[13px] font-medium">Гість</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                          Історія недоступна без входу
                        </p>
                      </div>
                    )}
                  </div>

                  {isLoggedIn ? (
                    <button
                      type="button"
                      onClick={() => {
                        haptic.tap();
                        onLogout();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-[4px] border border-black/[0.12] px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-white/[0.12] dark:text-zinc-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Вийти
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        haptic.impact();
                        onLogin();
                      }}
                      className="rounded-[4px] bg-[#111113] px-3 py-1.5 text-[11px] font-medium text-[#f4f4f2] transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-[#0c0c0e] dark:hover:bg-white"
                    >
                      Увійти
                    </button>
                  )}
                </div>
              </section>

              <p className="px-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
                Діалоги, налаштування та пам’ять зберігаються у вашому акаунті в MongoDB
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-0.5 rounded-[4px] border border-black/[0.1] bg-[#eaeae7] p-0.5 dark:border-white/[0.1] dark:bg-[#141416]">
                {(['global', 'da', 'en'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => {
                      haptic.tap();
                      setMemoryScope(scope);
                    }}
                    className={`rounded-[2px] py-1.5 text-[11px] font-medium transition-colors ${
                      memoryScope === scope
                        ? 'bg-white text-[#111113] dark:bg-[#1c1c1f] dark:text-zinc-100'
                        : 'text-zinc-500 hover:text-[#111113] dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                    aria-pressed={memoryScope === scope}
                  >
                    {scope === 'global' ? 'Загальні' : scope === 'da' ? 'Данська' : 'Англійська'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAddFact} className="flex gap-2">
                <input
                  type="text"
                  value={newFact}
                  onChange={(event) => setNewFact(event.target.value)}
                  placeholder="Факт про вас або вашу мету"
                  maxLength={200}
                  className="h-10 flex-1 rounded-[4px] border border-black/[0.12] bg-white px-3 text-[16px] text-[#111113] placeholder-zinc-400 focus:border-amber-500 focus:outline-none dark:border-white/[0.12] dark:bg-[#141416] dark:text-zinc-100 dark:placeholder-zinc-500 sm:text-[13px]"
                />
                <button
                  type="submit"
                  disabled={!newFact.trim()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-amber-500 text-[#0c0c0e] transition-colors hover:bg-amber-400 disabled:opacity-40"
                  aria-label="Додати факт"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </form>

              {currentFactList.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-zinc-500 dark:text-zinc-500">
                  Немає збережених фактів
                </p>
              ) : (
                <div className="space-y-1.5">
                  {currentFactList.map((fact, index) => (
                    <div
                      key={`${fact}-${index}`}
                      className="flex items-start justify-between gap-2 rounded-[4px] border border-black/[0.09] bg-white p-3 dark:border-white/[0.09] dark:bg-[#141416]"
                    >
                      <p className="flex-1 text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {fact}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDeleteFact(index)}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        aria-label="Видалити факт"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
