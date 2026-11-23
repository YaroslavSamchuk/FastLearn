import React, { useState, useEffect } from 'react';
import { User, Language } from '../types.ts';
import { ArrowLeft, X, LogOut, Volume2, Globe, Brain, Plus, Trash2 } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isLoggedIn: boolean;
  onLogin: () => void;
  currentLanguage: Language;
  onUpdateLanguage: (lang: Language) => void;
  currentVoice: string;
  onUpdateVoice: (voice: string) => void;
  onLogout: () => void;
  onMemoryUpdate?: (scope: 'global' | 'da' | 'en', action: 'add' | 'delete', value: string | number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  isLoggedIn,
  onLogin,
  currentLanguage,
  onUpdateLanguage,
  currentVoice,
  onUpdateVoice,
  onLogout,
  onMemoryUpdate
}) => {
  // Smooth enter & exit animation controller
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  const [activeTab, setActiveTab] = useState<'general' | 'memory'>('general');
  const [memoryScope, setMemoryScope] = useState<'global' | 'da' | 'en'>('global');
  const [newFact, setNewFact] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frameId);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const voicesForLanguage = currentLanguage === 'da'
    ? [
        { id: 'da-DK-ChristelNeural', label: 'Christel — природний жіночий голос' },
        { id: 'da-DK-JeppeNeural', label: 'Jeppe — природний чоловічий голос' }
      ]
    : [
        { id: 'en-US-JennyNeural', label: 'Jenny — природний жіночий голос' },
        { id: 'en-US-GuyNeural', label: 'Guy — природний чоловічий голос' }
      ];

  const memories = user?.memories || { global: [], da: [], en: [] };
  const currentFactList = memories[memoryScope] || [];

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/user/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: memoryScope, fact: newFact.trim() })
      });
      if (res.ok) {
        if (onMemoryUpdate) {
          onMemoryUpdate(memoryScope, 'add', newFact.trim());
        }
        setNewFact('');
      }
    } catch (err) {
      console.warn('Failed to add memory fact:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFact = async (index: number) => {
    try {
      const res = await fetch('/api/user/memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: memoryScope, index })
      });
      if (res.ok) {
        if (onMemoryUpdate) {
          onMemoryUpdate(memoryScope, 'delete', index);
        }
      }
    } catch (err) {
      console.warn('Failed to delete memory fact:', err);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-[#f4f4f5] flex flex-col overflow-hidden transition-all duration-200 ease-out select-none ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'
      }`}
    >
      {/* Top Bar with Back Button */}
      <div className="h-14 border-b border-zinc-200 dark:border-zinc-800/80 px-4 sm:px-8 flex items-center justify-between shrink-0 bg-white dark:bg-[#0c0c0e]">
        <button
          onClick={onClose}
          className="flex items-center gap-2 py-1.5 px-2.5 -ml-2 rounded-md text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs sm:text-sm font-medium cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 stroke-[1.75]" />
          <span>Назад до чату</span>
        </button>

        <h1 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase font-mono tracking-wider">
          [НАЛАШТУВАННЯ]
        </h1>

        <button
          onClick={onClose}
          className="p-1.5 -mr-1 rounded-md text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Закрити"
        >
          <X className="w-4 h-4 stroke-[1.75]" />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-[#0c0c0e]/60 shrink-0">
        <div className="max-w-2xl mx-auto px-4 flex gap-6">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 px-1 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'general'
                ? 'border-amber-400 text-amber-700 dark:text-amber-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Основне</span>
          </button>

          <button
            onClick={() => setActiveTab('memory')}
            className={`py-3 px-1 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'memory'
                ? 'border-amber-400 text-amber-700 dark:text-amber-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Пам'ять співрозмовника</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {activeTab === 'general' ? (
            <>
              {/* Account Section */}
              <div className="p-4 rounded-lg bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 shadow-xs">
                {isLoggedIn && user ? (
                  <>
                    <div className="flex items-center gap-3.5 min-w-0">
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-10 h-10 rounded-md border border-zinc-300 dark:border-zinc-700 object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 truncate">{user.name}</div>
                        <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">{user.email}</div>
                      </div>
                    </div>
                    <button
                      onClick={onLogout}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100/80 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 text-xs font-mono transition-colors cursor-pointer shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Вийти</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <div className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">Ви зараз не авторизовані</div>
                    <button
                      onClick={onLogin}
                      className="px-3.5 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-medium text-xs transition-colors cursor-pointer shadow-xs"
                    >
                      Увійти через Google
                    </button>
                  </div>
                )}
              </div>

              {/* Language Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                  Мова навчання
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => onUpdateLanguage('da')}
                    className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                      currentLanguage === 'da'
                        ? 'border-amber-400 bg-amber-400/10 text-zinc-950 dark:text-zinc-100 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 mb-0.5">🇩🇰 Данська (Dansk)</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Розмовна практика та вимова</div>
                  </button>

                  <button
                    onClick={() => onUpdateLanguage('en')}
                    className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                      currentLanguage === 'en'
                        ? 'border-amber-400 bg-amber-400/10 text-zinc-950 dark:text-zinc-100 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 mb-0.5">🇬🇧 Англійська (English)</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Вільне щоденне спілкування</div>
                  </button>
                </div>
              </div>

              {/* Voice Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500 block">
                  Голос озвучення
                </label>
                <div className="space-y-2">
                  {voicesForLanguage.map((v) => (
                    <label
                      key={v.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer text-xs sm:text-sm font-medium transition-colors ${
                        currentVoice === v.id
                          ? 'border-amber-400 bg-amber-400/10 text-zinc-950 dark:text-zinc-100'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Volume2 className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>{v.label}</span>
                      </div>
                      <input
                        type="radio"
                        name="voice"
                        value={v.id}
                        checked={currentVoice === v.id}
                        onChange={() => onUpdateVoice(v.id)}
                        className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Memory Section */}
              <div className="space-y-3">
                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Факти, які ШІ враховує у відповідях. ШІ адаптує теми та лексику відповідно до ваших інтересів:
                </p>

                {/* Scope selector */}
                <div className="grid grid-cols-3 gap-1.5 bg-zinc-100 dark:bg-[#111114] p-1 rounded-md border border-zinc-200 dark:border-zinc-800 font-mono text-xs">
                  <button
                    onClick={() => setMemoryScope('global')}
                    className={`py-1.5 px-1 rounded-sm transition-colors cursor-pointer text-center ${
                      memoryScope === 'global'
                        ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 font-semibold shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    Загальне
                  </button>
                  <button
                    onClick={() => setMemoryScope('da')}
                    className={`py-1.5 px-1 rounded-sm transition-colors cursor-pointer text-center ${
                      memoryScope === 'da'
                        ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 font-semibold shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    🇩🇰 Данська
                  </button>
                  <button
                    onClick={() => setMemoryScope('en')}
                    className={`py-1.5 px-1 rounded-sm transition-colors cursor-pointer text-center ${
                      memoryScope === 'en'
                        ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 font-semibold shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    🇬🇧 Англійська
                  </button>
                </div>

                {/* Add Fact Form */}
                <form onSubmit={handleAddFact} className="flex gap-2">
                  <input
                    type="text"
                    value={newFact}
                    onChange={(e) => setNewFact(e.target.value)}
                    placeholder="Додати факт про себе (наприклад: цікавлюсь IT, живу в Орхусі)..."
                    className="flex-1 bg-white dark:bg-[#111114] border border-zinc-300 dark:border-zinc-800 rounded-md px-3 py-2 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-hidden focus:border-zinc-500 shadow-xs"
                  />
                  <button
                    type="submit"
                    disabled={!newFact.trim() || isSaving}
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-zinc-950 font-medium text-xs rounded-md transition-colors flex items-center gap-1 shrink-0 cursor-pointer shadow-xs active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Додати</span>
                  </button>
                </form>

                {/* Facts List */}
                <div className="space-y-1.5 pt-2">
                  {currentFactList.length === 0 ? (
                    <div className="p-6 rounded-md border border-dashed border-zinc-200 dark:border-zinc-800 text-center font-mono text-xs text-zinc-400 dark:text-zinc-500">
                      [порожньо]
                    </div>
                  ) : (
                    currentFactList.map((fact, idx) => (
                      <div
                        key={idx}
                        className="group flex items-start justify-between gap-3 p-3 rounded-md bg-white dark:bg-[#111114] hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 transition-colors shadow-xs"
                      >
                        <span className="flex-1 leading-relaxed">{fact}</span>
                        <button
                          onClick={() => handleDeleteFact(idx)}
                          title="Видалити"
                          className="p-1 text-zinc-400 hover:text-red-500 transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
