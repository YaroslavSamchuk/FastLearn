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
    const timer = window.setTimeout(() => setShouldRender(false), 180);
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
        className={`fixed inset-0 bg-black/50 transition-opacity duration-200 dark:bg-black/75 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          haptic.tap();
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 flex h-full w-[min(304px,86vw)] flex-col border-r border-black/[0.1] bg-[#f4f4f2] text-[#111113] transition-transform duration-200 ease-out dark:border-white/[0.1] dark:bg-[#101012] dark:text-zinc-100 ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-black/[0.08] px-4 dark:border-white/[0.08]">
          <span className="font-mono text-[13px] font-medium tracking-tight">FastLearn</span>
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-zinc-500 transition-colors duration-150 hover:bg-black/[0.06] hover:text-[#111113] dark:text-zinc-400 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100"
            aria-label="Закрити меню"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="border-b border-black/[0.08] p-4 dark:border-white/[0.08]">
          {isLoggedIn && user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <UserAvatar name={user.name} src={user.avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{user.name}</p>
                  <p className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                    {user.email}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>Повідомлення</span>
                  <span className="font-mono tabular-nums text-[#111113] dark:text-zinc-200">
                    {quota.remaining}/{quota.limit}
                  </span>
                </div>
                <div className="h-1 w-full bg-black/[0.08] dark:bg-white/[0.1]">
                  <div
                    className={`h-full transition-[width] duration-200 ${quotaColor}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-500">
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
              className="h-10 w-full rounded-[4px] bg-[#111113] px-3 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-[#111113] dark:hover:bg-white"
            >
              Увійти через Google
            </button>
          )}
        </div>

        {isLoggedIn && (
          <div className="p-4 pb-2">
            <button
              type="button"
              onClick={handleCreateChat}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[4px] border border-black/[0.12] bg-white px-4 text-[13px] font-medium text-[#111113] transition-colors duration-150 hover:border-black/25 hover:bg-zinc-100 dark:border-white/[0.12] dark:bg-[#141416] dark:text-zinc-100 dark:hover:border-white/25 dark:hover:bg-[#1c1c1f]"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              <span>Новий діалог</span>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          {!isLoggedIn ? (
            <div className="flex h-full flex-col items-center justify-center px-5 pb-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-black/[0.1] bg-white text-zinc-500 dark:border-white/[0.1] dark:bg-[#141416] dark:text-zinc-400">
                <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <p className="mt-3 text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                Історія після входу
              </p>
              <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-500">
                Увійдіть через Google, щоб синхронізувати діалоги та пам’ять
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
                  Діалоги · {currentLanguage === 'da' ? 'Dansk' : 'English'}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-500">
                  {chats.length}
                </span>
              </div>

              {chats.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] text-zinc-500 dark:text-zinc-500">
                  Немає діалогів цією мовою
                </p>
              ) : (
                <div className="space-y-1">
                  {chats.map((chat) => {
                    const isActive = chat._id === activeChatId;
                    return (
                      <div
                        key={chat._id}
                        onClick={() => handleSelect(chat._id)}
                        className={`group relative flex h-9 cursor-pointer items-center gap-2.5 rounded-[4px] px-2.5 transition-colors duration-150 ${
                          isActive
                            ? 'bg-white text-[#111113] dark:bg-[#1c1c1f] dark:text-zinc-50'
                            : 'text-zinc-700 hover:bg-black/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.05]'
                        }`}
                      >
                        {isActive && (
                          <span
                            className="absolute bottom-1.5 left-0 top-1.5 w-[2px] bg-amber-500"
                            aria-hidden="true"
                          />
                        )}
                        <MessageSquare
                          className={`h-4 w-4 shrink-0 ${
                            isActive
                              ? 'text-[#111113] dark:text-zinc-100'
                              : 'text-zinc-400 dark:text-zinc-500'
                          }`}
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
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-zinc-400 opacity-100 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-600 focus-visible:opacity-100 dark:text-zinc-500 dark:hover:bg-red-500/15 dark:hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
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

        <div className="border-t border-black/[0.08] p-3 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={handleOpenSettings}
            className="flex h-9 w-full items-center gap-2.5 rounded-[4px] px-2.5 text-left text-[13px] font-medium text-zinc-700 transition-colors duration-150 hover:bg-black/[0.05] hover:text-[#111113] dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100"
          >
            <Settings className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} />
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
              className="mt-1 flex h-9 w-full items-center gap-2.5 rounded-[4px] px-2.5 text-left text-[13px] text-zinc-500 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>Вийти</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
