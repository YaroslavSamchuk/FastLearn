// language: TypeScript (React), file: src/components/BurgerDrawer.tsx, target: Web / Mobile Browser
import React, { useState, useEffect } from 'react';
import { User, Chat, Language } from '../types.ts';
import { X, Plus, Trash2, MessageSquare, Settings, Bookmark, LogOut, Sparkles } from 'lucide-react';
import { haptic } from '../utils/haptics.ts';

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
  onDeleteChat: (chatId: string, e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  onOpenWordVault?: () => void;
}

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
  onOpenWordVault
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frameId);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 240);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const updateCountdown = () => {
      if (!user?.resetAt) return;
      const diffMs = new Date(user.resetAt).getTime() - Date.now();
      if (diffMs <= 0) {
        setTimeLeft('сьогодні');
        return;
      }
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${hours} год ${mins} хв`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [user?.resetAt]);

  if (!shouldRender) return null;

  const remaining = typeof user?.messagesRemaining === 'number' ? user.messagesRemaining : 30;
  const limit = user?.dailyLimit || 30;
  const percentage = Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));
  const barColor = remaining > 10 ? 'bg-amber-400' : remaining > 3 ? 'bg-yellow-500' : 'bg-red-500';

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

  const handleOpenVault = () => {
    haptic.impact();
    if (onOpenWordVault) onOpenWordVault();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex select-none">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs transition-opacity duration-240 ease-out cursor-pointer ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          haptic.tap();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Drawer Container (ChatGPT Mobile styled) */}
      <div
        className={`relative w-80 max-w-[85vw] h-full glass-drawer flex flex-col z-10 transition-transform duration-240 ease-out text-zinc-900 dark:text-zinc-100 ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Header / Account Profile */}
        <div className="p-4 sm:p-5 border-b border-zinc-200/80 dark:border-white/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse" />
              <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-600 dark:text-zinc-300">
                FASTLEARN
              </span>
            </div>

            <button
              onClick={() => {
                haptic.tap();
                onClose();
              }}
              className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400"
              aria-label="Закрити меню"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {isLoggedIn && user ? (
            <div className="flex items-center gap-3">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-amber-400/40"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-[13px] font-semibold truncate tracking-tight">
                  {user.name}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono">
                  {user.email}
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                haptic.impact();
                onLogin();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs tracking-tight transition-all active:scale-95 shadow-xs"
            >
              Увійти через Google
            </button>
          )}

          {/* Daily Quota Progress Bar */}
          {isLoggedIn && (
            <div className="mt-3.5 pt-3 border-t border-zinc-200/60 dark:border-white/5">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mb-1.5">
                <span>Денна квота</span>
                <span className="tabular-numbers font-semibold text-zinc-800 dark:text-zinc-200">
                  {remaining} / {limit}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-300 rounded-full`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              {timeLeft && (
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono mt-1 text-right">
                  Скидання через: {timeLeft}
                </p>
              )}
            </div>
          )}
        </div>

        {/* New Chat Primary Button */}
        <div className="p-3 border-b border-zinc-200/80 dark:border-white/5">
          <button
            onClick={handleCreateChat}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-semibold text-xs sm:text-[13px] tracking-tight transition-all active:scale-[0.98] shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Новий діалог</span>
          </button>
        </div>

        {/* Chats History List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 overscroll-contain">
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Діалоги ({currentLanguage === 'da' ? 'Dansk' : 'English'})
          </div>

          {chats.map((c) => {
            const isActive = c._id === activeChatId;
            return (
              <div
                key={c._id}
                onClick={() => handleSelect(c._id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                  isActive
                    ? 'bg-amber-400/15 dark:bg-amber-400/10 text-amber-900 dark:text-amber-300 font-semibold border border-amber-400/30'
                    : 'hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MessageSquare className="w-4 h-4 shrink-0 stroke-[1.8] opacity-70" />
                  <span className="text-xs sm:text-[13px] truncate tracking-tight">
                    {c.title}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    haptic.warning();
                    onDeleteChat(c._id, e);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-500 transition-all cursor-pointer"
                  title="Видалити діалог"
                  aria-label="Видалити діалог"
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[1.8]" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Bottom Drawer Actions: Word Vault & Settings */}
        <div className="p-3 border-t border-zinc-200/80 dark:border-white/5 space-y-1 bg-zinc-50/50 dark:bg-black/20">
          {onOpenWordVault && (
            <button
              onClick={handleOpenVault}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 text-xs sm:text-[13px] font-medium transition-colors cursor-pointer"
            >
              <Bookmark className="w-4 h-4 stroke-[1.8] text-amber-500" />
              <span>Словник збережених слів</span>
            </button>
          )}

          <button
            onClick={handleOpenSettings}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 text-xs sm:text-[13px] font-medium transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4 stroke-[1.8]" />
            <span>Налаштування & Пам’ять ШІ</span>
          </button>

          {isLoggedIn && (
            <button
              onClick={() => {
                haptic.tap();
                onLogout();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-500 hover:text-red-500 text-xs font-medium transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 stroke-[1.8]" />
              <span>Вийти з акаунта</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
