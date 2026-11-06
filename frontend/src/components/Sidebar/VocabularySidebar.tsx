import React, { useState, useMemo } from 'react';
import { BookOpen, Search, Volume2, Trash2, X, Download, Upload } from 'lucide-react';
import type { WordRecord, WordStatus } from '../../types';
import { SpeechService } from '../../services/speech';
import { StorageService } from '../../services/storage';

interface VocabularySidebarProps {
  isOpen: boolean;
  words: WordRecord[];
  speechRate: number;
  onUpdateStatus: (word: string, status: WordStatus) => void;
  onDeleteWord: (word: string) => void;
  onReloadWords: () => void;
  onClose: () => void;
}

export const VocabularySidebar: React.FC<VocabularySidebarProps> = ({
  isOpen,
  words,
  speechRate,
  onUpdateStatus,
  onDeleteWord,
  onReloadWords,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<number | 'all'>('all');

  const stats = useMemo(() => {
    let learning = 0;
    let known = 0;
    let newWords = 0;
    for (const w of words) {
      if (w.status === 1 || w.status === 2) learning++;
      else if (w.status === 3) known++;
      else newWords++;
    }
    return { total: words.length, learning, known, newWords };
  }, [words]);

  const filteredWords = useMemo(() => {
    return words.filter((w) => {
      const matchSearch =
        !search ||
        w.word.toLowerCase().includes(search.toLowerCase()) ||
        (w.translation_uk && w.translation_uk.toLowerCase().includes(search.toLowerCase()));

      let matchFilter = true;
      if (filterStatus === 'all') matchFilter = true;
      else if (filterStatus === 1) matchFilter = w.status === 1 || w.status === 2;
      else matchFilter = w.status === filterStatus;

      return matchSearch && matchFilter;
    });
  }, [words, search, filterStatus]);

  const handleExportAnki = () => {
    const csvContent = StorageService.exportAnkiCsv();
    const blob = new Blob([csvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fastlearn-dansk-anki-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const jsonStr = StorageService.exportAllData();
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fastlearn-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = StorageService.importAllData(content);
        if (ok) {
          alert('Дані успішно імпортовано!');
          onReloadWords();
        } else {
          alert('Помилка при читанні файлу бекапу.');
        }
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-96 max-w-full bg-white h-full border-l-2 border-black p-4 flex flex-col z-10 shadow-[-6px_0px_0px_0px_#000000]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-black" />
            <h2 className="font-bold text-base tracking-tight font-mono uppercase">
              Словник (LingQ)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-black hover:text-white border border-black transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-1 mb-3 text-center text-xs font-mono">
          <div className="p-1.5 bg-zinc-100 border border-black">
            <div className="text-[10px] text-zinc-500 uppercase">Всього</div>
            <div className="font-bold text-sm">{stats.total}</div>
          </div>
          <div className="p-1.5 bg-yellow-100 border border-black">
            <div className="text-[10px] text-yellow-800 uppercase">Вчу</div>
            <div className="font-bold text-sm text-yellow-950">{stats.learning}</div>
          </div>
          <div className="p-1.5 bg-emerald-100 border border-black">
            <div className="text-[10px] text-emerald-800 uppercase">Знаю</div>
            <div className="font-bold text-sm text-emerald-950">{stats.known}</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук слова чи перекладу..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border-2 border-black focus:outline-none focus:bg-white font-mono"
          />
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setFilterStatus('all')}
            className={`flex-1 py-1 text-xs font-mono border border-black transition-all ${
              filterStatus === 'all' ? 'bg-black text-white font-bold' : 'bg-zinc-100 hover:bg-zinc-200'
            }`}
          >
            Всі ({stats.total})
          </button>
          <button
            onClick={() => setFilterStatus(1)}
            className={`flex-1 py-1 text-xs font-mono border border-black transition-all ${
              filterStatus === 1 ? 'bg-yellow-300 font-bold' : 'bg-zinc-100 hover:bg-yellow-100'
            }`}
          >
            Вчу ({stats.learning})
          </button>
          <button
            onClick={() => setFilterStatus(3)}
            className={`flex-1 py-1 text-xs font-mono border border-black transition-all ${
              filterStatus === 3 ? 'bg-emerald-300 font-bold' : 'bg-zinc-100 hover:bg-emerald-100'
            }`}
          >
            Знаю ({stats.known})
          </button>
        </div>

        {/* Words list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredWords.length === 0 ? (
            <div className="text-center py-10 text-xs font-mono text-zinc-400">
              {words.length === 0
                ? 'Словник порожній. Клікайте на слова у діалозі, щоб додавати їх!'
                : 'Нічого не знайдено за запитом.'}
            </div>
          ) : (
            filteredWords.map((w) => {
              let statusBg = 'bg-blue-100';
              if (w.status === 1) statusBg = 'bg-yellow-200';
              if (w.status === 2) statusBg = 'bg-yellow-100';
              if (w.status === 3) statusBg = 'bg-emerald-200';

              return (
                <div
                  key={w.word_clean}
                  className="p-2 border-2 border-black bg-zinc-50 hover:bg-white transition-all shadow-[1px_1px_0px_0px_#000] flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm tracking-tight text-zinc-950">
                        {w.word}
                      </span>
                      <button
                        onClick={() => SpeechService.speak(w.word, { rate: speechRate })}
                        className="p-0.5 hover:bg-zinc-200 border border-black"
                        title="Озвучити"
                      >
                        <Volume2 className="w-3 h-3 text-black" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 border border-black ${statusBg}`}>
                        {w.status === 3 ? 'Знаю' : w.status === 0 ? 'Нове' : `Вчу ${w.status}`}
                      </span>
                      <button
                        onClick={() => onDeleteWord(w.word_clean)}
                        className="p-0.5 hover:bg-red-500 hover:text-white border border-black transition-colors"
                        title="Видалити зі словника"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-700 font-sans">
                    {w.translation_uk || <span className="text-zinc-400 italic">Без перекладу</span>}
                  </div>

                  {/* Quick status switch */}
                  <div className="flex items-center gap-1 pt-1 mt-1 border-t border-zinc-200">
                    <span className="text-[10px] font-mono text-zinc-400">Статус:</span>
                    <button
                      onClick={() => onUpdateStatus(w.word_clean, 1)}
                      className={`px-1 text-[10px] font-mono border border-black ${
                        w.status === 1 ? 'bg-yellow-400 font-bold' : 'bg-white hover:bg-yellow-100'
                      }`}
                    >
                      1
                    </button>
                    <button
                      onClick={() => onUpdateStatus(w.word_clean, 2)}
                      className={`px-1 text-[10px] font-mono border border-black ${
                        w.status === 2 ? 'bg-yellow-200 font-bold' : 'bg-white hover:bg-yellow-100'
                      }`}
                    >
                      2
                    </button>
                    <button
                      onClick={() => onUpdateStatus(w.word_clean, 3)}
                      className={`px-1 text-[10px] font-mono border border-black ${
                        w.status === 3 ? 'bg-emerald-300 font-bold' : 'bg-white hover:bg-emerald-100'
                      }`}
                    >
                      ✓ Знаю
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions: Anki & Backup */}
        <div className="pt-3 border-t-2 border-black flex flex-col gap-2">
          <button
            onClick={handleExportAnki}
            className="brutal-btn w-full py-1.5 bg-yellow-300 text-black text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            title="Експорт словника у файл для імпорту в Anki"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Експорт в Anki (TSV/CSV)</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleExportJson}
              className="flex-1 py-1 bg-zinc-100 hover:bg-zinc-200 border border-black text-[11px] font-mono flex items-center justify-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span>Бекап JSON</span>
            </button>

            <label className="flex-1 py-1 bg-zinc-100 hover:bg-zinc-200 border border-black text-[11px] font-mono flex items-center justify-center gap-1 cursor-pointer">
              <Upload className="w-3 h-3" />
              <span>Імпорт JSON</span>
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
