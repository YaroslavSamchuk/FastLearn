import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { ChatSession } from '../../types';

interface ChatsSidebarProps {
  isOpen: boolean;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onCreateChat: () => void;
  onDeleteChat: (id: string) => void;
  onClose: () => void;
}

export const ChatsSidebar: React.FC<ChatsSidebarProps> = ({
  isOpen,
  chats,
  activeChatId,
  onSelectChat,
  onCreateChat,
  onDeleteChat,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full sm:w-80 bg-white h-full border-r border-stone-200 p-4 flex flex-col z-10 shadow-xl max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200">
          <h2 className="font-semibold text-base text-stone-900 tracking-tight">
            Діалоги
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-900 rounded transition-colors"
            aria-label="Закрити"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New chat action */}
        <button
          onClick={() => {
            onCreateChat();
            onClose();
          }}
          className="w-full py-2 px-3 bg-stone-900 hover:bg-black text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 mb-3 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Нова бесіда</span>
        </button>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {chats.length === 0 ? (
            <div className="text-center py-12 text-xs text-stone-400">
              Немає збережених діалогів
            </div>
          ) : (
            chats.map((c) => {
              const isActive = c.id === activeChatId;
              const dateStr = new Date(c.updated_at).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    onSelectChat(c.id);
                    onClose();
                  }}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between group ${
                    isActive
                      ? 'bg-stone-100 border-stone-300 font-medium'
                      : 'bg-white hover:bg-stone-50 border-stone-100 text-stone-700'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="text-sm truncate text-stone-900">
                      {c.title || 'Бесіда датською'}
                    </div>
                    <div className="text-[10px] font-mono text-stone-400 mt-0.5">
                      {dateStr}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Видалити цей діалог?')) {
                        onDeleteChat(c.id);
                      }
                    }}
                    className="p-1.5 text-stone-400 hover:text-red-600 rounded transition-colors"
                    title="Видалити"
                    aria-label="Видалити діалог"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-stone-200 text-[11px] text-stone-400 text-center font-mono">
          Збережено локально у браузері
        </div>
      </div>
    </div>
  );
};
