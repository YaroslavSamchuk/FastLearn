// language: TypeScript (React), file: src/components/Header.tsx, target: Web / Mobile Browser
import React, { useEffect, useRef, useState } from 'react';
import { Menu, Moon, Sun, Pencil, Check } from 'lucide-react';
import { Language } from '../types.ts';
import { haptic } from '../utils/haptics.ts';

interface HeaderProps {
  chatTitle: string;
  language: Language;
  onOpenDrawer: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onSelectLanguage: (lang: Language) => void;
  onRenameChat?: (newTitle: string) => void;
}

const iconButton =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-200/70 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500/30 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100';

export const Header: React.FC<HeaderProps> = ({
  chatTitle,
  language,
  onOpenDrawer,
  theme,
  onToggleTheme,
  onSelectLanguage,
  onRenameChat
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(chatTitle);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(chatTitle);
    }
  }, [chatTitle, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditingTitle]);

  const handleSaveTitle = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== chatTitle) {
      onRenameChat?.(trimmed);
    } else {
      setTitleDraft(chatTitle);
    }
    setIsEditingTitle(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setTitleDraft(chatTitle);
      setIsEditingTitle(false);
    }
  };

  const handleDrawer = () => {
    haptic.impact();
    onOpenDrawer();
  };

  const handleTheme = () => {
    haptic.tap();
    onToggleTheme();
  };

  const handleLanguageSwitch = () => {
    haptic.tap();
    onSelectLanguage(language === 'da' ? 'en' : 'da');
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-stone-200/80 bg-[#faf9f6] px-3 transition-colors dark:border-white/[0.08] dark:bg-[#0c0a09] sm:h-16 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={handleDrawer}
          className={iconButton}
          title="Меню діалогів і налаштувань"
          aria-label="Відкрити меню"
        >
          <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[15px] font-semibold text-stone-950 dark:text-stone-50 shrink-0">
            FastLearn
          </span>

          <span className="h-4 w-px bg-stone-300 dark:bg-stone-700 hidden sm:inline shrink-0" aria-hidden="true" />

          {isEditingTitle ? (
            <form onSubmit={handleSaveTitle} className="flex items-center gap-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => handleSaveTitle()}
                maxLength={60}
                className="h-8 w-[130px] rounded-lg border border-amber-500/60 bg-white px-2.5 text-[12px] font-medium text-stone-900 shadow-sm outline-none ring-2 ring-amber-500/20 dark:bg-stone-900 dark:text-stone-100 sm:w-[200px] md:w-[300px]"
                placeholder={language === 'da' ? 'Titel...' : 'Title...'}
              />
              <button
                type="submit"
                onMouseDown={(e) => e.preventDefault()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 shrink-0"
                title="Зберегти назву"
                aria-label="Зберегти назву"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!onRenameChat) return;
                haptic.tap();
                setIsEditingTitle(true);
              }}
              className="group flex max-w-[140px] items-center gap-1 rounded-lg px-2 py-1 text-left transition-colors hover:bg-stone-200/60 dark:hover:bg-white/[0.08] sm:max-w-[220px] md:max-w-[340px]"
              title="Натисніть, щоб змінити назву діалогу"
              aria-label="Змінити назву діалогу"
            >
              <span className="truncate text-[12px] sm:text-[13px] text-stone-600 group-hover:text-stone-950 dark:text-stone-400 dark:group-hover:text-stone-100">
                {chatTitle || (language === 'da' ? 'Ny samtale' : 'New conversation')}
              </span>
              <Pencil className="h-3 w-3 shrink-0 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-stone-500" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleLanguageSwitch}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-stone-700 transition-colors hover:bg-stone-200/70 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500/30 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-stone-50"
          title="Перемкнути мову практики"
          aria-label={`Змінити мову. Зараз ${language === 'da' ? 'данська' : 'англійська'}`}
        >
          <span className="font-mono text-[11px] font-medium tracking-wide text-amber-700 dark:text-amber-400">
            {language === 'da' ? 'DA' : 'EN'}
          </span>
          <span className="hidden text-[13px] sm:inline">
            {language === 'da' ? 'Dansk' : 'English'}
          </span>
        </button>

        <span className="mx-0.5 h-5 w-px bg-stone-200 dark:bg-white/[0.08]" aria-hidden="true" />

        <button
          type="button"
          onClick={handleTheme}
          className={iconButton}
          title={theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
          aria-label={theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
        >
          {theme === 'dark' ? (
            <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </header>
  );
};
