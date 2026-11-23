// language: TypeScript (React), file: src/components/WordVaultDrawer.tsx, target: Web / Mobile Browser
import React, { useState, useEffect } from 'react';
import { WordVaultItem, Language } from '../types.ts';
import { X, Volume2, Trash2, Copy, Check, Bookmark, Search, Sparkles } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { haptic } from '../utils/haptics.ts';

interface WordVaultDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onPlayAudio: (text: string, speed?: number) => void;
  isPlaying: boolean;
  currentPlayingText?: string;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const WordVaultDrawer: React.FC<WordVaultDrawerProps> = ({
  isOpen,
  onClose,
  language,
  onPlayAudio,
  isPlaying,
  currentPlayingText,
  onShowToast
}) => {
  const [words, setWords] = useState<WordVaultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load words when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/words?language=${language}`)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) return r.json();
        return [];
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setWords(data);
        }
      })
      .catch(() => setWords([]))
      .finally(() => setLoading(false));
  }, [isOpen, language]);

  const handleDelete = async (phrase: string) => {
    haptic.impact();
    try {
      await fetch('/api/words', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase, language })
      });
      setWords((prev) => prev.filter((w) => w.phrase !== phrase));
      onShowToast('Видалено зі словника', 'info');
    } catch {
      onShowToast('Помилка видалення', 'warning');
    }
  };

  const handleCopy = (phrase: string) => {
    haptic.tap();
    navigator.clipboard.writeText(phrase);
    setCopiedId(phrase);
    onShowToast('Скопійовано в буфер', 'success');
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handlePlay = (phrase: string, speed = 0.8) => {
    haptic.tap();
    onPlayAudio(phrase, speed);
  };

  if (!isOpen) return null;

  const filteredWords = words.filter(
    (w) =>
      w.phrase.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.translation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.ipa && w.ipa.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm transition-opacity duration-200"
        onClick={() => {
          haptic.impact();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative w-full sm:w-[420px] max-w-full h-full glass-drawer flex flex-col z-10 animate-spring-in text-zinc-900 dark:text-zinc-100">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200/80 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-400 text-zinc-950 shadow-sm">
              <Bookmark className="w-4 h-4 stroke-[2.2]" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Словник слів & фраз</h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                {language === 'da' ? 'DANSK' : 'ENGLISH'} • {words.length} збережено
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            aria-label="Закрити словник"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3.5 border-b border-zinc-200/80 dark:border-white/5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Шукати слово, транскрипцію або переклад..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-[13px] rounded-xl bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-amber-400 dark:focus:border-amber-400/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
            />
          </div>
        </div>

        {/* Word Cards List */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5 overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-400 text-xs font-mono">
              Завантаження збережених слів...
            </div>
          ) : filteredWords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <span className="p-3 rounded-2xl bg-amber-400/10 text-amber-500 mb-3">
                <Sparkles className="w-6 h-6 stroke-[1.8]" />
              </span>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">
                {searchQuery ? 'Нічого не знайдено' : 'Словник порожній'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">
                {searchQuery
                  ? 'Спробуйте інший пошуковий запит'
                  : 'Виділяйте будь-які незрозумілі слова в чаті та зберігайте їх сюди одним дотиком!'}
              </p>
            </div>
          ) : (
            filteredWords.map((item, idx) => {
              const isItemPlaying = isPlaying && currentPlayingText === item.phrase;

              return (
                <div
                  key={idx}
                  className="group relative p-3.5 rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200/80 dark:border-white/5 hover:border-amber-400/60 dark:hover:border-amber-400/50 shadow-xs transition-all duration-150"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm sm:text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                          {item.phrase}
                        </span>
                        {item.ipa && (
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-amber-400/15 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400 font-medium">
                            {item.ipa}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-400 mt-1 leading-snug">
                        {item.translation}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handlePlay(item.phrase, 0.8)}
                        className={`p-2 rounded-xl transition-all cursor-pointer ${
                          isItemPlaying
                            ? 'bg-amber-400 text-zinc-950 shadow-sm'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                        }`}
                        title="Прослухати 0.8x"
                        aria-label="Прослухати вимову"
                      >
                        {isItemPlaying ? (
                          <AudioVisualizer isPlaying={true} barColor="bg-zinc-950" />
                        ) : (
                          <Volume2 className="w-4 h-4 stroke-[1.8]" />
                        )}
                      </button>

                      <button
                        onClick={() => handleCopy(item.phrase)}
                        className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
                        title="Скопіювати слово"
                        aria-label="Скопіювати"
                      >
                        {copiedId === item.phrase ? (
                          <Check className="w-4 h-4 text-emerald-500 stroke-[2]" />
                        ) : (
                          <Copy className="w-4 h-4 stroke-[1.8]" />
                        )}
                      </button>

                      <button
                        onClick={() => handleDelete(item.phrase)}
                        className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Видалити зі словника"
                        aria-label="Видалити"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.8]" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
