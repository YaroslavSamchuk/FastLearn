// language: TypeScript (React), file: src/components/BurgerDrawer.tsx, target: Web / Mobile Browser
import React, { useEffect, useRef, useState } from 'react';
import { User, Chat, Language, Quota } from '../types.ts';
import {
  X,
  Plus,
  Trash2,
  MessageSquare,
  Settings,
  LogOut,
  Check,
  Globe,
  ChevronDown
} from 'lucide-react';
import { haptic } from '../utils/haptics.ts';
import { UserAvatar } from './UserAvatar.tsx';
import { formatResetAt } from '../lib/data.ts';
import { BrandMark } from './BrandMark.tsx';

interface BurgerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  currentLanguage: Language;
  onSelectLanguage: (lang: Language) => void;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onOpenSettings: () => void;
  quota: Quota;
}

const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: Language;
  title: string;
  native: string;
}> = [
  { value: 'da', title: 'Данська мова', native: 'Dansk' },
  { value: 'en', title: 'Англійська мова', native: 'English' }
];

export const BurgerDrawer: React.FC<BurgerDrawerProps> = ({
  isOpen,
  onClose,
  user,
  isLoggedIn,
  onLogin,
  onLogout,
  currentLanguage,
  onSelectLanguage,
  chats,
  activeChatId,
  onSelectChat,
  onCreateNewChat,
  onDeleteChat,
  onOpenSettings,
  quota
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setConfirmDeleteId(null);
      setIsLanguageMenuOpen(false);
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frameId);
    }

    setIsVisible(false);
    setConfirmDeleteId(null);
    setIsLanguageMenuOpen(false);
    const timer = window.setTimeout(() => setShouldRender(false), 200);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        languageMenuRef.current &&
        event.target instanceof Node &&
        !languageMenuRef.current.contains(event.target)
      ) {
        setIsLanguageMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsLanguageMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isLanguageMenuOpen]);

  if (!shouldRender) return null;

  const percentage = Math.max(0, Math.min(100, Math.round((quota.remaining / quota.limit) * 100)));
  const quotaColor = quota.remaining <= 5 ? 'bg-[#dc2626] dark:bg-[#e5484d]' : 'bg-amber-500';

  const handleCreateChat = () => {
    haptic.send();
    onCreateNewChat();
    onClose();
  };

  const handleSelect = (id: string) => {
    haptic.tap();
    onSelectChat(id);
    onClose();
  };

  const handleOpenSettings = () => {
    haptic.impact();
    setIsLanguageMenuOpen(false);
    onOpenSettings();
    onClose();
  };

  const handleSelectLanguage = (language: Language) => {
    haptic.tap();
    setIsLanguageMenuOpen(false);
    onSelectLanguage(language);
  };

  return (
    <div className="fixed inset-0 z-50 flex select-none" role="dialog" aria-modal="true" aria-label="Меню">
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-200 ease-unslop dark:bg-black/75 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          haptic.tap();
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        className={`pt-safe relative z-10 flex h-full w-[min(296px,85vw)] flex-col border-r border-black/[0.08] bg-[#f6f5f1] text-[#1c1917] transition-transform duration-200 ease-unslop dark:border-white/[0.08] dark:bg-[#121110] dark:text-[#efede8] sm:w-[min(304px,86vw)] ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/[0.08] px-3.5 dark:border-white/[0.08] sm:h-14 sm:px-4">
          <div className="flex items-center gap-2">
            <BrandMark className="h-4 w-4" />
            <span className="text-[15px] font-semibold">FastLearn</span>
          </div>
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-black/[0.05] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:bg-white/[0.06] dark:hover:text-[#efede8] sm:h-8 sm:w-8"
            aria-label="Закрити меню"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="border-b border-black/[0.08] p-3.5 dark:border-white/[0.08] sm:p-4">
          {isLoggedIn && user ? (
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center gap-3">
                <UserAvatar name={user.name} src={user.avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{user.name}</p>
                  <p className="truncate font-mono text-[12px] text-[#736d65] dark:text-[#8a847c]">
                    {user.email}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-[12px] text-[#57534e] dark:text-[#a8a29a] sm:mb-2">
                  <span>Повідомлення</span>
                  <span className="font-mono tabular-nums text-[#1c1917] dark:text-[#efede8]">
                    {quota.remaining}/{quota.limit}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.1]">
                  <div
                    className={`h-full w-full origin-left transition-transform duration-200 ease-unslop ${quotaColor}`}
                    style={{ transform: `scaleX(${percentage / 100})` }}
                  />
                </div>
                <p className="mt-1.5 text-right font-mono text-[12px] tabular-nums text-[#736d65] dark:text-[#8a847c] sm:mt-2">
                  Оновлення через {formatResetAt(quota.resetAt)}
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                haptic.impact();
                onLogin();
              }}
              className="h-10 w-full rounded-lg bg-[#1c1917] px-4 text-[14px] font-medium text-[#f6f5f1] transition-[background-color,transform] duration-150 ease-unslop hover:bg-[#342e2a] active:scale-[0.98] dark:bg-[#efede8] dark:text-[#161513] dark:hover:bg-white"
            >
              Увійти через Google
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 sm:px-4">
          {!isLoggedIn ? (
            <div className="flex h-full flex-col items-center justify-center px-4 pb-8 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-[#736d65] dark:border-white/[0.08] dark:bg-[#1c1a18] dark:text-[#a8a29a]">
                <MessageSquare className="h-4 w-4" strokeWidth={1.5} />
              </span>
              <p className="mt-3 text-[14px] font-medium text-[#1c1917] dark:text-[#efede8]">
                Історія після входу
              </p>
              <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-[#736d65] dark:text-[#8a847c]">
                Увійдіть через Google, щоб синхронізувати діалоги та пам’ять
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between pb-2 pt-1">
                <span className="text-[12px] font-medium text-[#736d65] dark:text-[#8a847c]">
                  Діалоги · {currentLanguage === 'da' ? 'Dansk' : 'English'}
                </span>
                <span className="font-mono text-[12px] tabular-nums text-[#736d65] dark:text-[#8a847c]">
                  {chats.length}
                </span>
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleCreateChat}
                  className="flex h-10 w-full items-center gap-2.5 rounded-lg pl-3 pr-2 text-left text-[#57534e] transition-colors duration-150 ease-unslop hover:bg-black/[0.04] hover:text-[#1c1917] dark:text-[#a8a29a] dark:hover:bg-white/[0.05] dark:hover:text-[#efede8] sm:h-9"
                >
                  <Plus
                    className="h-4 w-4 shrink-0 text-[#736d65] dark:text-[#8a847c]"
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    Новий діалог
                  </span>
                </button>

                {chats.length === 0 ? (
                  <p className="py-6 text-center text-[12px] text-[#736d65] dark:text-[#8a847c]">
                    Немає діалогів цією мовою
                  </p>
                ) : (
                  chats.map((chat) => {
                    const isActive = chat._id === activeChatId;
                    const isConfirming = confirmDeleteId === chat._id;

                    return (
                      <div
                        key={chat._id}
                        className={`group relative flex items-center gap-1 rounded-lg transition-colors duration-150 ease-unslop ${
                          isActive
                            ? 'bg-white text-[#1c1917] dark:bg-[#262421] dark:text-[#efede8]'
                            : 'text-[#57534e] hover:bg-black/[0.04] hover:text-[#1c1917] dark:text-[#a8a29a] dark:hover:bg-white/[0.05] dark:hover:text-[#efede8]'
                        }`}
                      >
                        {isActive && (
                          <span
                            className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full bg-amber-500"
                            aria-hidden="true"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => handleSelect(chat._id)}
                          className="flex h-10 min-w-0 flex-1 items-center gap-2.5 pl-3 pr-1 text-left sm:h-9"
                        >
                          <MessageSquare
                            className={`h-4 w-4 shrink-0 ${
                              isActive
                                ? 'text-[#1c1917] dark:text-[#efede8]'
                                : 'text-[#736d65] dark:text-[#8a847c]'
                            }`}
                            strokeWidth={1.5}
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {chat.title}
                          </span>
                        </button>

                        {isConfirming ? (
                          <div className="flex shrink-0 items-center gap-1 pr-1">
                            <button
                              type="button"
                              onClick={() => {
                                haptic.warning();
                                setConfirmDeleteId(null);
                                onDeleteChat(chat._id);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-red-600/15 text-[#dc2626] transition-colors duration-150 ease-unslop hover:bg-red-600/25 dark:bg-red-500/20 dark:text-[#e5484d] dark:hover:bg-red-500/30"
                              title="Підтвердити видалення"
                              aria-label={`Підтвердити видалення діалогу ${chat.title}`}
                            >
                              <Check className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                haptic.tap();
                                setConfirmDeleteId(null);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-black/[0.06] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:bg-white/[0.08] dark:hover:text-[#efede8]"
                              title="Скасувати"
                              aria-label="Скасувати видалення"
                            >
                              <X className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              haptic.tap();
                              setConfirmDeleteId(chat._id);
                            }}
                            className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#736d65] opacity-100 transition-[background-color,color,opacity] duration-150 ease-unslop hover:bg-red-500/10 hover:text-[#dc2626] focus-visible:opacity-100 dark:text-[#8a847c] dark:hover:bg-red-500/15 dark:hover:text-[#e5484d] sm:opacity-0 sm:group-hover:opacity-100"
                            title="Видалити діалог"
                            aria-label={`Видалити діалог ${chat.title}`}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        <div className="pb-safe border-t border-black/[0.08] px-4 pt-3 dark:border-white/[0.08]">
          <div ref={languageMenuRef} className="relative mb-2">
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                setIsLanguageMenuOpen((open) => !open);
              }}
              aria-expanded={isLanguageMenuOpen}
              aria-haspopup="listbox"
              className="flex w-full items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-2 py-2 text-left transition-[background-color,border-color,transform] duration-150 ease-unslop hover:border-black/[0.16] hover:bg-[#eceae4]/70 active:scale-[0.99] dark:border-white/[0.08] dark:bg-[#1c1a18] dark:hover:border-white/[0.16] dark:hover:bg-[#262421]"
            >
              <Globe
                className="h-4 w-4 shrink-0 text-[#736d65] dark:text-[#8a847c]"
                strokeWidth={1.5}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-5 text-[#1c1917] dark:text-[#efede8]">
                  {currentLanguage === 'da' ? 'Данська мова' : 'Англійська мова'}
                </span>
                <span className="block truncate text-[12px] leading-4 text-[#736d65] dark:text-[#8a847c]">
                  Натисніть для вибору мови
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#736d65] transition-transform duration-150 ease-unslop dark:text-[#8a847c] ${
                  isLanguageMenuOpen ? 'rotate-180' : ''
                }`}
                strokeWidth={1.5}
              />
            </button>

            {isLanguageMenuOpen && (
              <div
                role="listbox"
                aria-label="Вибір мови практики"
                className="animate-popover absolute bottom-full left-0 right-0 z-20 mb-2 rounded-xl border border-black/[0.1] bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:border-white/[0.1] dark:bg-[#1c1a18] dark:shadow-none"
              >
                {LANGUAGE_OPTIONS.map((option) => {
                  const selected = currentLanguage === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => handleSelectLanguage(option.value)}
                      className={`relative flex h-10 w-full items-center justify-between gap-2 rounded-lg px-2 text-left transition-colors duration-150 ease-unslop sm:h-9 ${
                        selected
                          ? 'bg-[#f6f5f1] text-[#1c1917] dark:bg-[#262421] dark:text-[#efede8]'
                          : 'text-[#57534e] hover:bg-black/[0.04] hover:text-[#1c1917] dark:text-[#a8a29a] dark:hover:bg-white/[0.05] dark:hover:text-[#efede8]'
                      }`}
                    >
                      {selected && (
                        <span
                          className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full bg-amber-500"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 flex-1 pl-1.5">
                        <span className="block truncate text-[13px] font-medium">
                          {option.title}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[12px] text-[#736d65] dark:text-[#8a847c]">
                          {option.native}
                        </span>
                        {selected && (
                          <Check
                            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                            strokeWidth={1.5}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenSettings}
            className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium text-[#57534e] transition-colors duration-150 ease-unslop hover:bg-black/[0.05] hover:text-[#1c1917] dark:text-[#a8a29a] dark:hover:bg-white/[0.06] dark:hover:text-[#efede8] sm:h-9"
          >
            <Settings className="h-4 w-4 shrink-0 text-[#736d65] dark:text-[#8a847c]" strokeWidth={1.5} />
            <span>Налаштування й пам’ять</span>
          </button>

          {isLoggedIn && (
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                onLogout();
                onClose();
              }}
              className="mt-1 flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-red-500/10 hover:text-[#dc2626] dark:text-[#8a847c] dark:hover:bg-red-500/15 dark:hover:text-[#e5484d] sm:h-9"
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>Вийти</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
