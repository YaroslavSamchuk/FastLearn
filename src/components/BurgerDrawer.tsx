import React, { useState, useEffect } from 'react';
import { User, Chat, Language } from '../types.ts';
import { X, Plus, Trash2, MessageSquare, Settings, Zap, Clock } from 'lucide-react';

interface BurgerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
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
  currentLanguage,
  onSelectLanguage,
  chats,
  activeChatId,
  onSelectChat,
  onCreateNewChat,
  onDeleteChat,
  onOpenSettings
}) => {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const updateCountdown = () => {
      if (!user.resetAt) return;
      const diffMs = new Date(user.resetAt).getTime() - Date.now();
      if (diffMs <= 0) {
        setTimeLeft('Оновлюється...');
        return;
      }
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${hours} год ${mins} хв`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // update every minute
    return () => clearInterval(interval);
  }, [user.resetAt]);

  if (!isOpen) return null;

  const remaining = typeof user.messagesRemaining === 'number' ? user.messagesRemaining : 30;
  const limit = user.dailyLimit || 30;
  const percentage = Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));

  // Color dynamic
  const barColor = remaining > 10 ? 'bg-amber-400' : remaining > 3 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-72 max-w-[85vw] h-full bg-[#0e0e11] border-r border-white/10 flex flex-col z-10 shadow-2xl">
        {/* User Profile Header */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={user.avatar}
              alt={user.name}
              className="w-8 h-8 rounded-full border border-white/20 object-cover shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-100 truncate">
                {user.name}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 truncate">
                {user.email}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* --- DAILY QUOTA METER (Між акаунтом та списком чатів) --- */}
        <div className="p-3 border-b border-white/10 bg-[#121216]">
          <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
            <span className="flex items-center gap-1 text-zinc-400 uppercase tracking-wider text-[10px]">
              <Zap className="w-3 h-3 text-amber-400 shrink-0" />
              Денний ліміт
            </span>
            <span className="font-semibold text-zinc-200">
              <span className={remaining <= 5 ? 'text-red-400' : 'text-amber-400'}>{remaining}</span>
              <span className="text-zinc-500"> / {limit}</span>
            </span>
          </div>

          {/* Progress Track */}
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5">
            <div
              className={`h-full ${barColor} transition-all duration-300 rounded-full`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Reset Time Countdown */}
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-zinc-500" />
              Скидання:
            </span>
            <span className="text-zinc-400">{timeLeft || '15 годин'}</span>
          </div>
        </div>

        {/* Language Tabs */}
        <div className="p-2 border-b border-white/10">
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded border border-white/5">
            <button
              onClick={() => onSelectLanguage('da')}
              className={`py-1 text-xs font-mono rounded transition-colors ${
                currentLanguage === 'da'
                  ? 'bg-zinc-800 text-amber-400 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              🇩🇰 Dansk
            </button>
            <button
              onClick={() => onSelectLanguage('en')}
              className={`py-1 text-xs font-mono rounded transition-colors ${
                currentLanguage === 'en'
                  ? 'bg-zinc-800 text-amber-400 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              🇬🇧 English
            </button>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="p-2 border-b border-white/10">
          <button
            onClick={() => {
              onCreateNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>{currentLanguage === 'da' ? 'Ny samtale' : 'New Chat'}</span>
          </button>
        </div>

        {/* Chats List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-2 py-1">
            {currentLanguage === 'da' ? 'Dine samtaler (Dansk)' : 'Your chats (English)'}
          </div>

          {chats.length === 0 ? (
            <div className="text-xs text-zinc-600 px-2 py-4 italic text-center">
              {currentLanguage === 'da' ? 'Ingen samtaler endnu' : 'No chats yet'}
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat._id}
                onClick={() => {
                  onSelectChat(chat._id);
                  onClose();
                }}
                className={`group flex items-center justify-between p-2 rounded cursor-pointer transition-colors text-xs ${
                  chat._id === activeChatId
                    ? 'bg-white/10 text-amber-300 font-medium'
                    : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{chat.title}</span>
                </div>
                <button
                  onClick={(e) => onDeleteChat(chat._id, e)}
                  title="Delete chat"
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-white/10 text-[10px] font-mono text-zinc-500 flex items-center justify-between">
          <span>FastLearn · Gemini</span>
          <span className="text-zinc-600">v1.2 · brutal</span>
        </div>
      </div>
    </div>
  );
};
