// language: TypeScript (React), file: src/components/SettingsModal.tsx, target: Web / Mobile Browser
import React, { useEffect, useState } from 'react';
import { User, Language, UserMemories, VoiceMap } from '../types.ts';
import { X, LogOut, Globe, Brain, Plus, Trash2, Check, Volume2 } from 'lucide-react';
import { TTS_VOICES, resolveVoice } from '../../server/ttsConfig.js';
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
        className={`fixed inset-0 bg-stone-950/45 transition-opacity duration-200 dark:bg-black/65 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          haptic.tap();
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 flex h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-stone-200 bg-[#faf9f6] text-stone-900 transition-[opacity,transform] duration-200 dark:border-white/[0.09] dark:bg-[#12100e] dark:text-stone-100 sm:h-auto sm:max-h-[86dvh] sm:rounded-2xl ${
          isVisible ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-3 opacity-0 sm:scale-[0.98]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Налаштування"
      >
        <div className="flex items-center justify-between border-b border-stone-200/80 px-4 py-3.5 dark:border-white/[0.07] sm:px-5">
          <h2 className="text-[15px] font-semibold">Налаштування</h2>
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
            aria-label="Закрити налаштування"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-stone-200/80 p-2 dark:border-white/[0.07]">
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              setActiveTab('general');
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-medium transition-colors ${
              activeTab === 'general'
                ? 'bg-stone-200/70 text-stone-950 dark:bg-white/[0.08] dark:text-stone-50'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-500 dark:hover:text-stone-200'
            }`}
            aria-pressed={activeTab === 'general'}
          >
            <Globe className="h-4 w-4" strokeWidth={1.75} />
            Загальні
          </button>

          {isLoggedIn && (
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                setActiveTab('memory');
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-medium transition-colors ${
                activeTab === 'memory'
                  ? 'bg-stone-200/70 text-stone-950 dark:bg-white/[0.08] dark:text-stone-50'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-500 dark:hover:text-stone-200'
              }`}
              aria-pressed={activeTab === 'memory'}
            >
              <Brain className="h-4 w-4" strokeWidth={1.75} />
              Пам’ять
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {activeTab === 'general' ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-white/[0.08] dark:bg-[#171412]">
                <h3 className="text-[12px] font-medium text-stone-900 dark:text-stone-100">
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
                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? 'border-amber-500/50 bg-amber-50 text-stone-950 dark:border-amber-400/30 dark:bg-amber-400/[0.08] dark:text-stone-50'
                            : 'border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50 dark:border-white/[0.08] dark:text-stone-300 dark:hover:border-white/[0.14] dark:hover:bg-white/[0.03]'
                        }`}
                        aria-pressed={selected}
                      >
                        <span>
                          <span className="block text-[13px] font-medium">{option.title}</span>
                          <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-500">
                            {option.hint}
                          </span>
                        </span>
                        {selected && (
                          <Check
                            className="h-4 w-4 text-amber-700 dark:text-amber-400"
                            strokeWidth={2}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-stone-200/70 pt-3.5 dark:border-white/[0.07]">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-[12px] font-medium text-stone-900 dark:text-stone-100">
                      Голос озвучки · {currentLanguage === 'da' ? 'Dansk' : 'English'}
                    </h4>
                    {isLoggedIn && onPreviewVoice && (
                      <button
                        type="button"
                        onClick={() => {
                          haptic.tap();
                          onPreviewVoice(currentLanguage, activeVoice);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
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
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                            selected
                              ? 'border-amber-500/50 bg-amber-50 text-stone-950 dark:border-amber-400/30 dark:bg-amber-400/[0.08] dark:text-stone-50'
                              : 'border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50 dark:border-white/[0.08] dark:text-stone-300 dark:hover:border-white/[0.14] dark:hover:bg-white/[0.03]'
                          }`}
                          aria-pressed={selected}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium">{option.label}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-stone-500 dark:text-stone-500">
                              {option.hint}
                            </span>
                          </span>
                          {selected && (
                            <Check
                              className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
                              strokeWidth={2}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-white/[0.08] dark:bg-[#171412]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {isLoggedIn && user ? (
                      <>
                        <UserAvatar name={user.name} src={user.avatar} size={34} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{user.name}</p>
                          <p className="truncate font-mono text-[11px] text-stone-500 dark:text-stone-500">
                            {user.email}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <p className="text-[13px] font-medium">Гість</p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-500">
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-white/[0.09] dark:text-stone-400 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
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
                      className="rounded-lg bg-stone-900 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white"
                    >
                      Увійти
                    </button>
                  )}
                </div>
              </section>

              <p className="px-1 text-[11px] leading-relaxed text-stone-500 dark:text-stone-500">
                Діалоги, налаштування та пам’ять зберігаються в вашому акаунті в MongoDB
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-1 rounded-lg bg-stone-200/60 p-1 dark:bg-white/[0.05]">
                {(['global', 'da', 'en'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => {
                      haptic.tap();
                      setMemoryScope(scope);
                    }}
                    className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                      memoryScope === scope
                        ? 'bg-white text-stone-950 shadow-sm dark:bg-[#2a2521] dark:text-stone-50'
                        : 'text-stone-500 hover:text-stone-800 dark:text-stone-500 dark:hover:text-stone-200'
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
                  className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[16px] text-stone-900 placeholder-stone-400 focus:border-amber-500/60 focus:outline-none dark:border-white/[0.09] dark:bg-[#171412] dark:text-stone-100 dark:placeholder-stone-500 sm:text-[13px]"
                />
                <button
                  type="submit"
                  disabled={!newFact.trim()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-white transition-colors hover:bg-stone-800 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white"
                  aria-label="Додати факт"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </button>
              </form>

              {currentFactList.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-stone-500 dark:text-stone-500">
                  Немає збережених фактів
                </p>
              ) : (
                <div className="space-y-1.5">
                  {currentFactList.map((fact, index) => (
                    <div
                      key={`${fact}-${index}`}
                      className="flex items-start justify-between gap-2 rounded-lg border border-stone-200 bg-white p-3 dark:border-white/[0.08] dark:bg-[#171412]"
                    >
                      <p className="flex-1 text-[12px] leading-relaxed text-stone-700 dark:text-stone-300">
                        {fact}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDeleteFact(index)}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-stone-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
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
