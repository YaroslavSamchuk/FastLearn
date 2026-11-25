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
  'inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-zinc-600 transition-colors duration-150 hover:bg-black/[0.06] hover:text-[#111113] dark:text-zinc-400 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100';

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

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-black/[0.09] bg-[#f4f4f2] px-4 dark:border-white/[0.09] dark:bg-[#101012] sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => {
            haptic.impact();
            onOpenDrawer();
          }}
          className={iconButton}
          title="Меню діалогів і налаштувань"
          aria-label="Відкрити меню"
        >
          <Menu className="h-4 w-4" strokeWidth={1.75} />
        </button>

        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 font-mono text-[13px] font-medium tracking-tight text-[#111113] dark:text-zinc-100">
            FastLearn
          </span>

          <span className="hidden h-4 w-px shrink-0 bg-black/[0.12] dark:bg-white/[0.12] sm:inline" aria-hidden="true" />

          {isEditingTitle ? (
            <form onSubmit={handleSaveTitle} className="flex min-w-0 items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => handleSaveTitle()}
                maxLength={60}
                className="h-8 w-[140px] rounded-[4px] border border-amber-500 bg-white px-2 text-[13px] font-medium text-[#111113] outline-none dark:bg-[#161618] dark:text-zinc-100 sm:w-[220px] md:w-[300px]"
                placeholder={language === 'da' ? 'Titel' : 'Title'}
              />
              <button
                type="submit"
                onMouseDown={(e) => e.preventDefault()}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-amber-600 transition-colors duration-150 hover:bg-black/[0.05] dark:text-amber-400 dark:hover:bg-white/[0.07]"
                title="Зберегти назву"
                aria-label="Зберегти назву"
              >
                <Check className="h-4 w-4" strokeWidth={1.75} />
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
              className="group flex max-w-[144px] items-center gap-1.5 rounded-[4px] px-2 py-1 text-left transition-colors duration-150 hover:bg-black/[0.06] dark:hover:bg-white/[0.07] sm:max-w-[220px] md:max-w-[340px]"
              title="Натисніть, щоб змінити назву діалогу"
              aria-label="Змінити назву діалогу"
            >
              <span className="truncate text-[13px] text-zinc-600 group-hover:text-[#111113] dark:text-zinc-400 dark:group-hover:text-zinc-100">
                {chatTitle || (language === 'da' ? 'Ny samtale' : 'New conversation')}
              </span>
              <Pencil
                className="h-3.5 w-3.5 shrink-0 text-zinc-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-zinc-500"
                strokeWidth={1.75}
              />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            haptic.tap();
            onSelectLanguage(language === 'da' ? 'en' : 'da');
          }}
          className="inline-flex h-8 items-center gap-2 rounded-[4px] border border-black/[0.1] px-2.5 text-zinc-700 transition-colors duration-150 hover:border-black/20 hover:bg-black/[0.04] hover:text-[#111113] dark:border-white/[0.1] dark:text-zinc-300 dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100"
          title="Перемкнути мову практики"
          aria-label={`Змінити мову. Зараз ${language === 'da' ? 'данська' : 'англійська'}`}
        >
          <span className="font-mono text-[11px] font-medium tabular-nums text-amber-700 dark:text-amber-400">
            {language === 'da' ? 'DA' : 'EN'}
          </span>
          <span className="hidden text-[12px] font-medium sm:inline">
            {language === 'da' ? 'Dansk' : 'English'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic.tap();
            onToggleTheme();
          }}
          className={iconButton}
          title={theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
          aria-label={theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </header>
  );
};
