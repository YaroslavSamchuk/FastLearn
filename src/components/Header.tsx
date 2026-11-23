import React from 'react';
import { Menu, Settings, MessageSquare } from 'lucide-react';
import { Language } from '../types.ts';

interface HeaderProps {
  chatTitle: string;
  language: Language;
  onOpenDrawer: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  chatTitle,
  language,
  onOpenDrawer,
  onOpenSettings
}) => {
  return (
    <header className="h-12 border-b border-white/10 bg-[#09090b]/95 backdrop-blur px-3 flex items-center justify-between z-30 shrink-0">
      {/* Left: Burger Drawer Trigger */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenDrawer}
          className="p-1.5 -ml-1 text-zinc-400 hover:text-white rounded hover:bg-white/5 transition-colors"
          title="Open Chats Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Language Badge */}
        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-amber-400/90 font-medium uppercase tracking-wider">
          {language}
        </span>
      </div>

      {/* Center: Current Chat Title */}
      <div className="flex-1 px-3 text-center min-w-0">
        <h1 className="text-xs sm:text-sm font-medium text-zinc-200 truncate">
          {chatTitle || (language === 'da' ? 'Dansk samtale' : 'English chat')}
        </h1>
      </div>

      {/* Right: Settings Trigger */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenSettings}
          className="p-1.5 -mr-1 text-zinc-400 hover:text-white rounded hover:bg-white/5 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
