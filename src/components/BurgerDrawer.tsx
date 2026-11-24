// language: TypeScript (React), file: src/components/BurgerDrawer.tsx, target: Web / Mobile Browser
import React, { useEffect, useState } from 'react';
import { User, Chat, Language, Quota } from '../types.ts';
import { X, Plus, Trash2, MessageSquare, Settings, LogOut } from 'lucide-react';
import { haptic } from '../utils/haptics.ts';
import { UserAvatar } from './UserAvatar.tsx';
import { formatResetAt } from '../lib/data.ts';

interface BurgerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  currentLanguage: Language;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onOpenSettings: () => void;
  quota: Quota;
}

export const BurgerDrawer: React.FC<BurgerDrawerProps> = ({
  isOpen,
  onClose,
  user,
  isLoggedIn,
  onLogin,
  onLogout,
  currentLanguage,
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

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frameId);
    }

    setIsVisible(false);
    const timer = window.setTimeout(() => setShouldRender(false), 200);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!shouldRender) return null;

  const percentage = Math.max(0, Math.min(100, Math.round((quota.remaining / quota.limit) * 100)));
  const quotaColor = quota.remaining <= 5 ? 'bg-red-500' : 'bg-amber-500';

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
    onOpenSettings();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex select-none" role="dialog" aria-modal="true" aria-label="Меню">
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
        className={`relative z-10 flex h-full w-[min(320px,88vw)] flex-col border-r border-stone-200 bg-[#faf9f6] text-stone-900 transition-transform duration-200 ease-out dark:border-white/[0.08] dark:bg-[#12100e] dark:text-stone-100 ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <span className="text-[15px] font-semibold text-stone-950 dark:text-stone-50">
            FastLearn
          </span>
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
            aria-label="Закрити меню"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="border-y border-stone-200/80 px-4 py-4 dark:border-white/[0.07]">
          {isLoggedIn && user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <UserAvatar name={user.name} src={user.avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-stone-900 dark:text-stone-100">
                    {user.name}
                  </p>
                  <p className="truncate font-mono text-[11px] text-stone-500 dark:text-stone-500">
                    {user.email}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
                  <span>Повідомлення</span>
                  <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                    {quota.remaining}/{quota.limit}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-white/[0.08]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${quotaColor}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right font-mono text-[11px] text-stone-500 dark:text-stone-500">
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
              className="w-full rounded-lg bg-stone-900 px-3 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white"
            >
              Увійти через Google
            </button>
          )}
        </div>

        <div className="p-4">
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleCreateChat}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-[13px] font-medium text-stone-900 transition-colors hover:border-stone-300 hover:bg-stone-50 dark:border-white/[0.09] dark:bg-[#191817] dark:text-stone-100 dark:hover:border-white/[0.15] dark:hover:bg-[#201e1c]"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Новий діалог
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {!isLoggedIn ? (
            <div className="flex h-full flex-col items-center justify-center px-5 pb-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-200/70 text-stone-500 dark:bg-white/[0.06] dark:text-stone-400">
                <MessageSquare className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <p className="mt-3 text-[13px] font-medium text-stone-800 dark:text-stone-200">
                Історія після входу
              </p>
              <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-stone-500 dark:text-stone-500">
                Увійдіть через Google, щоб діалоги та пам’ять з’явилися тут.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[11px] text-stone-500 dark:text-stone-500">
                  Діалоги · {currentLanguage === 'da' ? 'Dansk' : 'English'}
                </span>
                <span className="font-mono text-[11px] text-stone-400 dark:text-stone-600">
                  {chats.length}
                </span>
              </div>

              {chats.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12px] text-stone-500 dark:text-stone-500">
                  Немає діалогів цією мовою
                </p>
              ) : (
                <div className="space-y-0.5">
                  {chats.map((chat) => {
                    const isActive = chat._id === activeChatId;
                    return (
                      <div
                        key={chat._id}
                        onClick={() => handleSelect(chat._id)}
                        className={`group relative flex h-9 cursor-pointer items-center gap-2 rounded-lg pl-3 pr-1.5 transition-colors ${
                          isActive
                            ? 'bg-stone-200/70 text-stone-950 dark:bg-white/[0.06] dark:text-stone-50'
                            : 'text-stone-700 hover:bg-stone-200/40 dark:text-stone-300 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        {isActive && (
                          <span
                            className="absolute bottom-2 left-0 top-2 w-[2px] rounded-full bg-amber-500"
                            aria-hidden="true"
                          />
                        )}
                        <MessageSquare
                          className="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500"
                          strokeWidth={1.75}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{chat.title}</span>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            haptic.warning();
                            onDeleteChat(chat._id);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 opacity-100 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 dark:text-stone-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Видалити діалог"
                          aria-label={`Видалити діалог ${chat.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-stone-200/80 p-3 dark:border-white/[0.07]">
          <button
            type="button"
            onClick={handleOpenSettings}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-stone-700 transition-colors hover:bg-stone-200/50 dark:text-stone-300 dark:hover:bg-white/[0.05]"
          >
            <Settings className="h-4 w-4 text-stone-500 dark:text-stone-500" strokeWidth={1.75} />
            Налаштування й пам’ять
          </button>

          {isLoggedIn && (
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                onLogout();
                onClose();
              }}
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-stone-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              Вийти
            </button>
          )}

          <p className="px-2.5 pt-2 text-[10px] text-stone-400 dark:text-stone-600">
            Дані зберігаються на цьому пристрої
          </p>
        </div>
      </div>
    </div>
  );
};
