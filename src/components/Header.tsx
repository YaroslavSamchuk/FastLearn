// language: TypeScript (React), file: src/components/Header.tsx, target: Web / Mobile Browser
import React from 'react';
import { Menu, Sun, Moon, Bookmark, Sparkles } from 'lucide-react';
import { Language } from '../types.ts';
import { haptic } from '../utils/haptics.ts';

interface HeaderProps {
  chatTitle: string;
  language: Language;
  onOpenDrawer: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenWordVault?: () => void;
  onSelectLanguage?: (lang: Language) => void;
}

export const Header: React.FC<HeaderProps> = ({
  chatTitle,
  language,
  onOpenDrawer,
  theme,
  onToggleTheme,
  onOpenWordVault,
  onSelectLanguage
}) => {
  const handleDrawer = () => {
    haptic.impact();
    onOpenDrawer();
  };

  const handleTheme = () => {
    haptic.tap();
    onToggleTheme();
  };

  const handleVault = () => {
    haptic.impact();
    if (onOpenWordVault) onOpenWordVault();
  };

  const handleLanguageSwitch = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.tap();
    if (onSelectLanguage) {
      onSelectLanguage(language === 'da' ? 'en' : 'da');
    }
  };

  return (
    <header className="h-14 sm:h-16 px-3.5 sm:px-6 flex items-center justify-between z-30 shrink-0 transition-colors select-none glass-island border-b border-zinc-200/80 dark:border-white/5">
      {/* Left: Navigation Trigger & Gemini Sparkle Aura Icon */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleDrawer}
          className="p-2 -ml-1 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
          title="Меню чатів та налаштувань"
          aria-label="Відкрити меню"
        >
          <Menu className="w-5 h-5 stroke-[1.8]" />
        </button>

        {/* Gemini-Style Living Sparkle Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/10 dark:bg-amber-400/10 border border-amber-400/20 text-amber-600 dark:text-amber-400">
          <Sparkles className="w-3.5 h-3.5 animate-gemini-glow" />
          <span className="text-[11px] font-semibold tracking-wider font-mono uppercase">FASTLEARN</span>
        </div>
      </div>

      {/* Center: Language Switcher Capsule & Chat Title */}
      <div className="flex items-center gap-2 max-w-[50%] sm:max-w-xs min-w-0">
        <button
          onClick={handleLanguageSwitch}
          className="group flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200/80 dark:border-white/10 active:scale-95 transition-all cursor-pointer shadow-2xs"
          title="Натисніть для перемикання мови"
          aria-label="Перемкнути мову"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse" />
          <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-tight">
            {language === 'da' ? 'DK Dansk' : 'EN English'}
          </span>
        </button>

        <span className="hidden md:inline-block text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[140px]">
          {chatTitle}
        </span>
      </div>

      {/* Right: Word Vault Drawer & Theme Toggle */}
      <div className="flex items-center gap-1">
        {onOpenWordVault && (
          <button
            onClick={handleVault}
            className="flex items-center gap-1 p-2 text-zinc-600 hover:text-amber-500 dark:text-zinc-400 dark:hover:text-amber-400 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
            title="Відкрити збережені слова (Словник)"
            aria-label="Словник"
          >
            <Bookmark className="w-4.5 h-4.5 stroke-[1.8]" />
          </button>
        )}

        <button
          onClick={handleTheme}
          className="p-2 text-zinc-600 hover:text-amber-500 dark:text-zinc-400 dark:hover:text-amber-400 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
          title={theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
          aria-label="Змінити тему"
        >
          {theme === 'dark' ? (
            <Sun className="w-4.5 h-4.5 stroke-[1.8] transition-transform duration-300 rotate-0 hover:rotate-90 text-amber-400" />
          ) : (
            <Moon className="w-4.5 h-4.5 stroke-[1.8] transition-transform duration-300 -rotate-12 hover:rotate-0 text-zinc-700" />
          )}
        </button>
      </div>
    </header>
  );
};
