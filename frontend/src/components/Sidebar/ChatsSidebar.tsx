import React from 'react';
import { Plus, MessageSquare, Trash2, X } from 'lucide-react';
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
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-80 max-w-full bg-white h-full border-r-2 border-black p-4 flex flex-col z-10 shadow-[6px_0px_0px_0px_#000000]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-black" />
            <h2 className="font-bold text-base tracking-tight font-mono uppercase">
              Діалоги
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-black hover:text-white border border-black transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New chat button */}
        <button
          onClick={() => {
            onCreateChat();
            onClose();
          }}
          className="brutal-btn w-full py-2 bg-black text-white text-xs font-mono font-bold flex items-center justify-center gap-2 mb-4 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Нова розмова</span>
        </button>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {chats.length === 0 ? (
            <div className="text-center py-10 text-xs font-mono text-zinc-400">
              Немає збережених розмов. Створіть нову!
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
                  className={`p-2.5 border-2 border-black transition-all cursor-pointer flex items-center justify-between group ${
                    isActive
                      ? 'bg-yellow-200 font-bold shadow-[2px_2px_0px_0px_#000]'
                      : 'bg-zinc-50 hover:bg-zinc-100 shadow-[1px_1px_0px_0px_#000]'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="text-sm truncate text-zinc-950 font-sans">
                      {c.title || 'Бесіда датською'}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      {dateStr}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Видалити цю бесіду?')) {
                        onDeleteChat(c.id);
                      }
                    }}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white border border-black transition-all"
                    title="Видалити"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t-2 border-black text-[10px] font-mono text-zinc-500">
          Всі повідомлення зберігаються у вашому браузері.
        </div>
      </div>
    </div>
  );
};
