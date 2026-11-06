import React, { useState, useMemo } from 'react';
import { Search, Volume2, Trash2, X, Download, Upload } from 'lucide-react';
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
    a.download = `fastlearn-anki-${new Date().toISOString().slice(0, 10)}.txt`;
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
          alert('Дані імпортовано');
          onReloadWords();
        } else {
          alert('Помилка при читанні файлу');
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
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full sm:w-96 bg-white h-full border-l border-stone-200 p-4 flex flex-col z-10 shadow-xl max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200">
          <h2 className="font-semibold text-base text-stone-900 tracking-tight">
            Словник слів
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-900 rounded transition-colors"
            aria-label="Закрити"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quiet Stats row */}
        <div className="grid grid-cols-3 gap-1.5 mb-3 text-center text-xs">
          <div className="p-2 bg-stone-50 rounded-lg border border-stone-100">
            <div className="text-[10px] text-stone-400 font-mono">Всього</div>
            <div className="font-semibold text-sm text-stone-900">{stats.total}</div>
          </div>
          <div className="p-2 bg-amber-50 rounded-lg border border-amber-100">
            <div className="text-[10px] text-amber-700 font-mono">Вчу</div>
            <div className="font-semibold text-sm text-amber-950">{stats.learning}</div>
          </div>
          <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <div className="text-[10px] text-emerald-700 font-mono">Знаю</div>
            <div className="font-semibold text-sm text-emerald-950">{stats.known}</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук слова чи перекладу..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900 focus:bg-white transition-colors"
          />
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setFilterStatus('all')}
            className={`flex-1 py-1 text-xs rounded-md font-mono transition-colors ${
              filterStatus === 'all'
                ? 'bg-stone-900 text-white font-medium'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Всі ({stats.total})
          </button>
          <button
            onClick={() => setFilterStatus(1)}
            className={`flex-1 py-1 text-xs rounded-md font-mono transition-colors ${
              filterStatus === 1
                ? 'bg-amber-400 text-amber-950 font-medium'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Вчу ({stats.learning})
          </button>
          <button
            onClick={() => setFilterStatus(3)}
            className={`flex-1 py-1 text-xs rounded-md font-mono transition-colors ${
              filterStatus === 3
                ? 'bg-emerald-500 text-white font-medium'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Знаю ({stats.known})
          </button>
        </div>

        {/* Words list */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {filteredWords.length === 0 ? (
            <div className="text-center py-12 text-xs text-stone-400">
              {words.length === 0 ? 'Словник порожній' : 'Нічого не знайдено'}
            </div>
          ) : (
            filteredWords.map((w) => {
              return (
                <div
                  key={w.word_clean}
                  className="p-2.5 rounded-lg border border-stone-200 bg-white hover:border-stone-300 transition-colors flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-stone-900">
                        {w.word}
                      </span>
                      <button
                        onClick={() => SpeechService.speak(w.word, { rate: speechRate })}
                        className="p-1 text-stone-400 hover:text-stone-900 transition-colors"
                        title="Озвучити"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                        {w.status === 3 ? 'Знаю' : w.status === 0 ? 'Нове' : `Вчу ${w.status}`}
                      </span>
                      <button
                        onClick={() => onDeleteWord(w.word_clean)}
                        className="p-1 text-stone-300 hover:text-red-600 transition-colors"
                        title="Видалити"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-stone-600 font-sans">
                    {w.translation_uk || <span className="text-stone-400 italic">Без перекладу</span>}
                  </div>

                  {/* Level buttons */}
                  <div className="flex items-center gap-1 pt-1.5 mt-1 border-t border-stone-100">
                    <span className="text-[10px] text-stone-400 font-mono mr-1">Рівень:</span>
                    <button
                      onClick={() => onUpdateStatus(w.word_clean, 1)}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                        w.status === 1 ? 'bg-amber-300 text-amber-950 font-bold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      1
                    </button>
                    <button
                      onClick={() => onUpdateStatus(w.word_clean, 2)}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                        w.status === 2 ? 'bg-amber-100 text-amber-900 font-bold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      2
                    </button>
                    <button
                      onClick={() => onUpdateStatus(w.word_clean, 3)}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                        w.status === 3 ? 'bg-emerald-500 text-white font-bold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      Знаю
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-3 border-t border-stone-200 flex flex-col gap-2">
          <button
            onClick={handleExportAnki}
            className="w-full py-2 bg-stone-900 hover:bg-black text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Експорт в Anki (TSV)</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleExportJson}
              className="flex-1 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-mono flex items-center justify-center gap-1 transition-colors"
            >
              <span>Бекап JSON</span>
            </button>

            <label className="flex-1 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-mono flex items-center justify-center gap-1 cursor-pointer transition-colors">
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
