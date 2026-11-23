import React, { useState, useEffect } from 'react';
import { User, Chat, Language } from '../types.ts';
import { X, Plus, Trash2, MessageSquare, Settings, Zap, Clock, LogOut } from 'lucide-react';

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
  onOpenSettings
}) => {
  // Smooth enter & exit animation controller
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
  const barColor = remaining > 10 ? 'bg-amber-400' : remaining > 3 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="fixed inset-0 z-50 flex select-none">
      {/* Backdrop with smooth fade enter/exit */}
      <div
        className={`fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs transition-opacity duration-240 ease-out cursor-pointer ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel with smooth slide-in/out */}
      <div
        className={`relative w-80 max-w-[85vw] h-full bg-white dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col z-10 shadow-2xl transition-transform duration-240 ease-out ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Header: Account Info or Login */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-[#101014]">
          {isLoggedIn && user ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-9 h-9 rounded-md border border-zinc-300 dark:border-zinc-700 object-cover shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 truncate">
                    {user.name}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                    {user.email}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Налаштування"
                >
                  <Settings className="w-4 h-4 stroke-[1.75]" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Закрити"
                >
                  <X className="w-4 h-4 stroke-[1.75]" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onLogin}
                className="flex-1 flex items-center justify-center gap-2.5 py-2 px-3 rounded-md bg-zinc-900 dark:bg-zinc-100 hover:opacity-90 text-xs font-medium text-white dark:text-zinc-950 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Увійти через Google</span>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Закрити"
              >
                <X className="w-4 h-4 stroke-[1.75]" />
              </button>
            </div>
          )}
        </div>

        {/* Daily Quota Section (Architectural Telemetry) */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-[#0e0e11]">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              Денний ліміт
            </span>
            <span className="font-mono text-xs tabular-numbers font-medium">
              <span className={remaining <= 5 ? 'text-red-500' : 'text-zinc-900 dark:text-zinc-100'}>{remaining}</span>
              <span className="text-zinc-400 dark:text-zinc-600"> / {limit}</span>
            </span>
          </div>

          {/* Clean brutalist progress line */}
          <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-xs overflow-hidden mb-2">
            <div
              className={`h-full ${barColor} transition-all duration-300`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Скидання:
            </span>
            <span>{timeLeft || 'сьогодні'}</span>
          </div>
        </div>

        {/* Language Selection */}
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2 px-1">
            Мова спілкування
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSelectLanguage('da')}
              className={`py-2 px-2.5 rounded-md border text-xs font-mono transition-all cursor-pointer text-center ${
                currentLanguage === 'da'
                  ? 'border-amber-400 bg-amber-400/10 text-amber-800 dark:text-amber-300 font-semibold'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              🇩🇰 DANSK
            </button>
            <button
              onClick={() => onSelectLanguage('en')}
              className={`py-2 px-2.5 rounded-md border text-xs font-mono transition-all cursor-pointer text-center ${
                currentLanguage === 'en'
                  ? 'border-amber-400 bg-amber-400/10 text-amber-800 dark:text-amber-300 font-semibold'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              🇬🇧 ENGLISH
            </button>
          </div>
        </div>

        {/* Create New Chat Button */}
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80">
          <button
            onClick={() => {
              onCreateNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/80 text-xs font-medium text-zinc-900 dark:text-zinc-100 transition-colors active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-500" />
            <span>Створити новий діалог</span>
          </button>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500 px-2 py-1">
            Історія розмов
          </div>

          {chats.length === 0 ? (
            <div className="text-xs text-zinc-400 dark:text-zinc-600 px-3 py-6 text-center font-mono">
              [немає збережених розмов]
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat._id}
                onClick={() => {
                  onSelectChat(chat._id);
                  onClose();
                }}
                className={`group flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-colors text-xs ${
                  chat._id === activeChatId
                    ? 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-950 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 font-medium'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{chat.title}</span>
                </div>
                <button
                  onClick={(e) => onDeleteChat(chat._id, e)}
                  title="Видалити розмову"
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-opacity shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Logout Button */}
        {isLoggedIn && (
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#0e0e11] flex items-center justify-end">
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-[11px] font-mono text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Вийти</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
