// language: TypeScript (React), file: src/components/Header.tsx, target: Web / Mobile Browser
import React, { useEffect, useRef, useState } from 'react';
import { Menu, Moon, Sun, Pencil, Check, X } from 'lucide-react';
import { Language } from '../types.ts';
import { haptic } from '../utils/haptics.ts';
import { BrandMark } from './BrandMark.tsx';

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
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#57534e] transition-[background-color,color,transform] duration-150 ease-unslop hover:bg-black/[0.05] hover:text-[#1c1917] active:scale-[0.97] dark:text-[#a8a29a] dark:hover:bg-white/[0.06] dark:hover:text-[#efede8] sm:h-8 sm:w-8';

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

  const handleCancelTitle = () => {
    setTitleDraft(chatTitle);
    setIsEditingTitle(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelTitle();
    }
  };

  return (
    <header className="pt-safe shrink-0 border-b border-black/[0.08] bg-[#f6f5f1] dark:border-white/[0.08] dark:bg-[#121110]">
      <div className="flex h-14 items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
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
            <Menu className="h-4 w-4" strokeWidth={1.5} />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div
              className={`shrink-0 items-center gap-2 ${
                isEditingTitle ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <BrandMark className="h-4 w-4" />
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#1c1917] dark:text-[#efede8]">
                FastLearn
              </span>
            </div>

            <span
              className="hidden h-4 w-px shrink-0 bg-black/[0.1] dark:bg-white/[0.1] sm:inline"
              aria-hidden="true"
            />

            {isEditingTitle ? (
              <form
                onSubmit={handleSaveTitle}
                className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => handleSaveTitle()}
                  maxLength={60}
                  aria-label="Назва діалогу"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-amber-500 bg-white px-2.5 text-[16px] font-medium text-[#1c1917] outline-none dark:bg-[#1c1a18] dark:text-[#efede8] sm:h-8 sm:w-[220px] sm:flex-none sm:text-[13px] md:w-[280px]"
                  placeholder={language === 'da' ? 'Titel' : 'Title'}
                />
                <button
                  type="submit"
                  onMouseDown={(e) => e.preventDefault()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-amber-700 transition-colors duration-150 ease-unslop hover:bg-black/[0.05] dark:text-amber-400 dark:hover:bg-white/[0.06] sm:h-8 sm:w-8"
                  title="Зберегти назву"
                  aria-label="Зберегти назву"
                >
                  <Check className="h-4 w-4" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleCancelTitle}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#736d65] transition-colors duration-150 ease-unslop hover:bg-black/[0.05] hover:text-[#1c1917] dark:text-[#8a847c] dark:hover:bg-white/[0.06] dark:hover:text-[#efede8] sm:hidden"
                  title="Скасувати"
                  aria-label="Скасувати перейменування"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
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
                className="group flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 text-left transition-colors duration-150 ease-unslop hover:bg-black/[0.05] dark:hover:bg-white/[0.06] sm:h-8 sm:max-w-[240px] md:max-w-[340px]"
                title="Натисніть, щоб змінити назву діалогу"
                aria-label="Змінити назву діалогу"
              >
                <span className="truncate text-[13px] text-[#57534e] group-hover:text-[#1c1917] dark:text-[#a8a29a] dark:group-hover:text-[#efede8]">
                  {chatTitle || (language === 'da' ? 'Ny samtale' : 'New conversation')}
                </span>
                <Pencil
                  className="h-4 w-4 shrink-0 text-[#736d65] opacity-60 transition-opacity duration-150 ease-unslop group-hover:opacity-100 dark:text-[#8a847c] sm:opacity-0"
                  strokeWidth={1.5}
                />
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onSelectLanguage(language === 'da' ? 'en' : 'da');
            }}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-black/[0.1] px-2.5 text-[#57534e] transition-[background-color,border-color,color,transform] duration-150 ease-unslop hover:border-black/20 hover:bg-black/[0.04] hover:text-[#1c1917] active:scale-[0.98] dark:border-white/[0.1] dark:text-[#a8a29a] dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:hover:text-[#efede8] sm:h-8"
            title="Перемкнути мову практики"
            aria-label={`Змінити мову. Зараз ${language === 'da' ? 'данська' : 'англійська'}`}
          >
            <span className="font-mono text-[12px] font-medium tabular-nums text-amber-700 dark:text-amber-400">
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
              <Sun className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Moon className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
