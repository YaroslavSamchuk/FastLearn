import React from 'react';
import { Menu, Sun, Moon } from 'lucide-react';
import { Language } from '../types.ts';

interface HeaderProps {
  chatTitle: string;
  language: Language;
  onOpenDrawer: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  chatTitle,
  language,
  onOpenDrawer,
  theme,
  onToggleTheme
}) => {
  return (
    <header className="h-14 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-[#09090b]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 transition-colors select-none">
      {/* Left: Burger Drawer Trigger & Brutalist Telemetry Badge */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenDrawer}
          className="p-2 -ml-1 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer"
          title="Меню навігації"
          aria-label="Відкрити меню"
        >
          <Menu className="w-4.5 h-4.5 stroke-[1.75]" />
        </button>

        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 font-mono text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
          <span>{language === 'da' ? 'DK // DANSK' : 'EN // ENGLISH'}</span>
        </div>
      </div>

      {/* Center: Current Chat Title */}
      <div className="flex-1 px-4 text-center min-w-0">
        <h1 className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate tracking-tight">
          {chatTitle || (language === 'da' ? 'Нова розмова' : 'New dialogue')}
        </h1>
      </div>

      {/* Right: Theme Toggle (Sun / Moon) */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleTheme}
          className="p-2 -mr-1 text-zinc-500 hover:text-amber-500 dark:text-zinc-400 dark:hover:text-amber-400 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer"
          title={theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
          aria-label="Змінити тему"
        >
          {theme === 'dark' ? (
            <Sun className="w-4.5 h-4.5 stroke-[1.75] transition-transform duration-200 rotate-0 hover:rotate-45" />
          ) : (
            <Moon className="w-4.5 h-4.5 stroke-[1.75] transition-transform duration-200 -rotate-12 hover:rotate-0 text-zinc-700" />
          )}
        </button>
      </div>
    </header>
  );
};
