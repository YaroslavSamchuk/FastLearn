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
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setConfirmDeleteIndex(null);
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frameId);
    }

    setIsVisible(false);
    setConfirmDeleteIndex(null);
    const timer = window.setTimeout(() => setShouldRender(false), 200);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isLoggedIn && activeTab === 'memory') setActiveTab('general');
  }, [isLoggedIn, activeTab]);

  useEffect(() => {
    setConfirmDeleteIndex(null);
  }, [memoryScope, activeTab]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 select-none sm:items-center sm:p-6">
      <div
        className={`fixed inset-0 bg-black/45 transition-opacity duration-200 ease-unslop dark:bg-black/75 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          haptic.tap();
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-black/[0.08] bg-[#f6f5f1] text-[#1c1917] shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-[opacity,transform] duration-200 ease-unslop dark:border-white/[0.08] dark:bg-[#121110] dark:text-[#efede8] dark:shadow-none sm:max-h-[85dvh] sm:rounded-xl ${
          isVisible ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-4 opacity-0 sm:scale-[0.98]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Налаштування"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-4 dark:border-white/[0.08] dark:bg-[#1c1a18] sm:px-5">
          <h2 className="text-[15px] font-medium tracking-[-0.01em]">Налаштування</h2>
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-[#eceae4] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:bg-[#262421] dark:hover:text-[#efede8] sm:h-8 sm:w-8"
            aria-label="Закрити налаштування"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex shrink-0 border-b border-black/[0.08] bg-white px-4 dark:border-white/[0.08] dark:bg-[#1c1a18] sm:px-5">
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              setActiveTab('general');
            }}
            className={`relative flex h-10 flex-1 items-center justify-center gap-2 border-b-2 text-[13px] font-medium transition-colors duration-150 ease-unslop ${
              activeTab === 'general'
                ? 'border-amber-500 text-[#1c1917] dark:text-[#efede8]'
                : 'border-transparent text-[#736d65] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:text-[#efede8]'
            }`}
            aria-pressed={activeTab === 'general'}
          >
            <Globe className="h-4 w-4" strokeWidth={1.5} />
            Загальні
          </button>

          {isLoggedIn && (
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                setActiveTab('memory');
              }}
              className={`relative flex h-10 flex-1 items-center justify-center gap-2 border-b-2 text-[13px] font-medium transition-colors duration-150 ease-unslop ${
                activeTab === 'memory'
                  ? 'border-amber-500 text-[#1c1917] dark:text-[#efede8]'
                  : 'border-transparent text-[#736d65] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:text-[#efede8]'
              }`}
              aria-pressed={activeTab === 'memory'}
            >
              <Brain className="h-4 w-4" strokeWidth={1.5} />
              Пам’ять
            </button>
          )}
        </div>

        <div className="pb-safe flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {activeTab === 'general' ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-black/[0.08] bg-white p-4 dark:border-white/[0.08] dark:bg-[#1c1a18]">
                <h3 className="text-[13px] font-medium text-[#1c1917] dark:text-[#efede8]">
                  Мова практики
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
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
                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ease-unslop ${
                          selected
                            ? 'border-black/[0.16] border-l-2 border-l-amber-500 bg-[#f6f5f1] text-[#1c1917] dark:border-white/[0.16] dark:border-l-amber-500 dark:bg-[#262421] dark:text-[#efede8]'
                            : 'border-black/[0.08] text-[#57534e] hover:border-black/[0.16] hover:bg-[#f6f5f1]/70 dark:border-white/[0.08] dark:text-[#a8a29a] dark:hover:border-white/[0.16] dark:hover:bg-[#262421]/60'
                        }`}
                        aria-pressed={selected}
                      >
                        <span>
                          <span className="block text-[14px] font-medium">{option.title}</span>
                          <span className="mt-0.5 block text-[12px] text-[#736d65] dark:text-[#8a847c]">
                            {option.hint}
                          </span>
                        </span>
                        {selected && (
                          <Check
                            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                            strokeWidth={1.5}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-black/[0.08] pt-4 dark:border-white/[0.08]">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-[13px] font-medium text-[#1c1917] dark:text-[#efede8]">
                      Голос озвучки · {currentLanguage === 'da' ? 'Dansk' : 'English'}
                    </h4>
                    {isLoggedIn && onPreviewVoice && (
                      <button
                        type="button"
                        onClick={() => {
                          haptic.tap();
                          onPreviewVoice(currentLanguage, activeVoice);
                        }}
                        className="inline-flex h-8 items-center gap-2 rounded-lg border border-black/[0.08] px-2.5 text-[12px] font-medium text-[#57534e] transition-colors duration-150 ease-unslop hover:bg-[#f6f5f1] hover:text-[#1c1917] dark:border-white/[0.08] dark:text-[#a8a29a] dark:hover:bg-[#262421] dark:hover:text-[#efede8]"
                        aria-label="Прослухати вибраний голос"
                      >
                        {isPreviewPlaying ? (
                          <AudioVisualizer isPlaying barColor="bg-amber-600 dark:bg-amber-400" />
                        ) : (
                          <Volume2 className="h-4 w-4" strokeWidth={1.5} />
                        )}
                        <span>{isPreviewPlaying ? 'Зупинити' : 'Перевірити'}</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
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
                          className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ease-unslop ${
                            selected
                              ? 'border-black/[0.16] border-l-2 border-l-amber-500 bg-[#f6f5f1] text-[#1c1917] dark:border-white/[0.16] dark:border-l-amber-500 dark:bg-[#262421] dark:text-[#efede8]'
                              : 'border-black/[0.08] text-[#57534e] hover:border-black/[0.16] hover:bg-[#f6f5f1]/70 dark:border-white/[0.08] dark:text-[#a8a29a] dark:hover:border-white/[0.16] dark:hover:bg-[#262421]/60'
                          }`}
                          aria-pressed={selected}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium">{option.label}</span>
                            <span className="mt-0.5 block truncate text-[12px] text-[#736d65] dark:text-[#8a847c]">
                              {option.hint}
                            </span>
                          </span>
                          {selected && (
                            <Check
                              className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                              strokeWidth={1.5}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 border-t border-black/[0.08] pt-4 dark:border-white/[0.08]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-[13px] font-medium text-[#1c1917] dark:text-[#efede8]">
                        Швидкості озвучки · {currentLanguage === 'da' ? 'Dansk' : 'English'}
                      </h4>
                      <p className="mt-0.5 font-mono text-[12px] tabular-nums text-[#736d65] dark:text-[#8a847c]">
                        Від {MAX_PLAYBACK_SPEED}× до {MIN_PLAYBACK_SPEED}× · перша вмикається одразу
                      </p>
                    </div>
                    {hasCustomSpeeds && (
                      <button
                        type="button"
                        onClick={handleResetSpeeds}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 text-[12px] font-medium text-[#57534e] transition-colors duration-150 ease-unslop hover:bg-[#f6f5f1] hover:text-[#1c1917] dark:border-white/[0.08] dark:text-[#a8a29a] dark:hover:bg-[#262421] dark:hover:text-[#efede8]"
                        aria-label="Скинути швидкості до стандартних"
                      >
                        <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
                        <span>Скинути</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {([0, 1, 2] as const).map((slotIndex) => {
                      const speed = activeSpeeds[slotIndex];
                      const slotLabel =
                        slotIndex === 0 ? 'Швидкість 1' : slotIndex === 1 ? 'Швидкість 2' : 'Швидкість 3';
                      const canDecrease = speed > MIN_PLAYBACK_SPEED + 1e-6;
                      const canIncrease = speed < MAX_PLAYBACK_SPEED - 1e-6;
                      return (
                        <div
                          key={slotIndex}
                          className="rounded-lg border border-black/[0.08] bg-[#f6f5f1] px-3 py-2.5 dark:border-white/[0.08] dark:bg-[#161513]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-[13px] font-medium text-[#1c1917] dark:text-[#efede8]">
                              <span>{slotLabel}</span>
                              {slotIndex === 0 && (
                                <span className="rounded px-1.5 py-0.5 font-mono text-[12px] font-medium text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400 dark:ring-amber-400/25">
                                  Авто
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[13px] font-medium tabular-nums text-amber-700 dark:text-amber-400">
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
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/[0.1] bg-white text-[#57534e] transition-colors duration-150 ease-unslop hover:bg-[#eceae4] hover:text-[#1c1917] disabled:opacity-35 dark:border-white/[0.1] dark:bg-[#1c1a18] dark:text-[#a8a29a] dark:hover:bg-[#262421] dark:hover:text-[#efede8] sm:h-8 sm:w-8"
                              aria-label={`Зменшити ${slotLabel}`}
                            >
                              <Minus className="h-4 w-4" strokeWidth={1.5} />
                            </button>

                            <div className="flex h-9 flex-1 items-center sm:h-8">
                              <input
                                type="range"
                                min={MIN_PLAYBACK_SPEED}
                                max={MAX_PLAYBACK_SPEED}
                                step={PLAYBACK_SPEED_STEP}
                                value={speed}
                                onChange={(event) =>
                                  handleSpeedSlotChange(slotIndex, Number.parseFloat(event.target.value))
                                }
                                className="h-2 w-full cursor-pointer accent-amber-600 dark:accent-amber-500"
                                aria-label={slotLabel}
                              />
                            </div>

                            <button
                              type="button"
                              disabled={!canIncrease}
                              onClick={() => {
                                haptic.tap();
                                handleSpeedSlotChange(slotIndex, speed + PLAYBACK_SPEED_STEP);
                              }}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/[0.1] bg-white text-[#57534e] transition-colors duration-150 ease-unslop hover:bg-[#eceae4] hover:text-[#1c1917] disabled:opacity-35 dark:border-white/[0.1] dark:bg-[#1c1a18] dark:text-[#a8a29a] dark:hover:bg-[#262421] dark:hover:text-[#efede8] sm:h-8 sm:w-8"
                              aria-label={`Збільшити ${slotLabel}`}
                            >
                              <Plus className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-black/[0.08] bg-white p-4 dark:border-white/[0.08] dark:bg-[#1c1a18]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {isLoggedIn && user ? (
                      <>
                        <UserAvatar name={user.name} src={user.avatar} size={36} />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium">{user.name}</p>
                          <p className="truncate font-mono text-[12px] text-[#736d65] dark:text-[#8a847c]">
                            {user.email}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <p className="text-[14px] font-medium">Гість</p>
                        <p className="text-[12px] text-[#736d65] dark:text-[#8a847c]">
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
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black/[0.1] px-3 text-[13px] font-medium text-[#57534e] transition-colors duration-150 ease-unslop hover:border-red-300 hover:bg-red-500/10 hover:text-[#dc2626] dark:border-white/[0.1] dark:text-[#a8a29a] dark:hover:border-red-900/60 dark:hover:bg-red-500/15 dark:hover:text-[#e5484d] sm:h-8"
                    >
                      <LogOut className="h-4 w-4" strokeWidth={1.5} />
                      Вийти
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        haptic.impact();
                        onLogin();
                      }}
                      className="h-9 shrink-0 rounded-lg bg-[#1c1917] px-3.5 text-[13px] font-medium text-[#f6f5f1] transition-colors duration-150 ease-unslop hover:bg-[#342e2a] dark:bg-[#efede8] dark:text-[#161513] dark:hover:bg-white sm:h-8"
                    >
                      Увійти
                    </button>
                  )}
                </div>
              </section>

              <p className="px-1 text-[12px] leading-relaxed text-[#736d65] dark:text-[#8a847c]">
                Діалоги, налаштування та пам’ять синхронізуються з вашим акаунтом
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-black/[0.08] bg-[#eceae4] p-1 dark:border-white/[0.08] dark:bg-[#1c1a18]">
                {(['global', 'da', 'en'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => {
                      haptic.tap();
                      setMemoryScope(scope);
                    }}
                    className={`h-8 rounded-lg text-[12px] font-medium transition-colors duration-150 ease-unslop ${
                      memoryScope === scope
                        ? 'bg-white text-[#1c1917] dark:bg-[#262421] dark:text-[#efede8]'
                        : 'text-[#736d65] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:text-[#efede8]'
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
                  className="h-10 flex-1 rounded-lg border border-black/[0.1] bg-white px-3 text-[16px] text-[#1c1917] placeholder-[#736d65] focus:border-amber-500 focus:outline-none dark:border-white/[0.1] dark:bg-[#1c1a18] dark:text-[#efede8] dark:placeholder-[#8a847c] sm:text-[14px]"
                />
                <button
                  type="submit"
                  disabled={!newFact.trim()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-[#1c1917] transition-[background-color,transform] duration-150 ease-unslop hover:bg-amber-400 active:scale-[0.97] disabled:opacity-40"
                  aria-label="Додати факт"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </form>

              {currentFactList.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[#736d65] dark:text-[#8a847c]">
                  Немає збережених фактів
                </p>
              ) : (
                <div className="space-y-2">
                  {currentFactList.map((fact, index) => {
                    const isConfirming = confirmDeleteIndex === index;
                    return (
                      <div
                        key={`${fact}-${index}`}
                        className="flex items-start justify-between gap-2 rounded-lg border border-black/[0.08] bg-white p-3 dark:border-white/[0.08] dark:bg-[#1c1a18]"
                      >
                        <p className="flex-1 pt-0.5 text-[13px] leading-relaxed text-[#57534e] dark:text-[#a8a29a]">
                          {fact}
                        </p>
                        {isConfirming ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                haptic.warning();
                                setConfirmDeleteIndex(null);
                                onMemoryUpdate(memoryScope, 'delete', index);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-red-600/15 text-[#dc2626] transition-colors duration-150 ease-unslop hover:bg-red-600/25 dark:bg-red-500/20 dark:text-[#e5484d] dark:hover:bg-red-500/30"
                              title="Підтвердити видалення"
                              aria-label="Підтвердити видалення факту"
                            >
                              <Check className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                haptic.tap();
                                setConfirmDeleteIndex(null);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-black/[0.05] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:bg-white/[0.06] dark:hover:text-[#efede8]"
                              title="Скасувати"
                              aria-label="Скасувати видалення факту"
                            >
                              <X className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              haptic.tap();
                              setConfirmDeleteIndex(index);
                            }}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-red-500/10 hover:text-[#dc2626] dark:text-[#8a847c] dark:hover:bg-red-500/15 dark:hover:text-[#e5484d]"
                            aria-label="Видалити факт"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
