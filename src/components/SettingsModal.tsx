// language: TypeScript (React), file: src/components/SettingsModal.tsx, target: Web / Mobile Browser
import React, { useState, useEffect } from 'react';
import { User, Language } from '../types.ts';
import { ArrowLeft, X, LogOut, Volume2, Globe, Brain, Plus, Trash2, Check, Sparkles } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { haptic } from '../utils/haptics.ts';

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
  onPreviewVoice?: (voice: string) => void;
  isPlayingPreview?: boolean;
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
  onMemoryUpdate,
  onPreviewVoice,
  isPlayingPreview = false
}) => {
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

  const voicesForLanguage =
    currentLanguage === 'da'
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
    haptic.impact();
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
    haptic.warning();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          haptic.tap();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Card (iOS/Android Native Inset Style) */}
      <div
        className={`relative w-full max-w-lg h-[92vh] sm:h-auto max-h-[85vh] glass-pill border border-zinc-200/90 dark:border-white/10 rounded-3xl flex flex-col z-10 shadow-2xl overflow-hidden transition-all duration-200 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200/80 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm sm:text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Налаштування застосунку
            </h2>
          </div>

          <button
            onClick={() => {
              haptic.tap();
              onClose();
            }}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            aria-label="Закрити налаштування"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Pills Switcher */}
        <div className="p-3 border-b border-zinc-200/80 dark:border-white/5 flex gap-1.5 bg-zinc-50/50 dark:bg-white/5">
          <button
            onClick={() => {
              haptic.tap();
              setActiveTab('general');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${
              activeTab === 'general'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Globe className="w-4 h-4 stroke-[2]" />
            <span>Загальні</span>
          </button>

          <button
            onClick={() => {
              haptic.tap();
              setActiveTab('memory');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${
              activeTab === 'memory'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Brain className="w-4 h-4 stroke-[2]" />
            <span>Пам’ять ШІ</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain">
          {activeTab === 'general' ? (
            <div className="space-y-4">
              {/* Language Selector Inset Card */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#141418] border border-zinc-200/80 dark:border-white/5">
                <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
                  Активна мова практики
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      haptic.tap();
                      onUpdateLanguage('da');
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      currentLanguage === 'da'
                        ? 'border-amber-400 bg-amber-400/10 text-amber-900 dark:text-amber-300 font-semibold'
                        : 'border-zinc-200 dark:border-white/5 hover:border-zinc-300 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold">Dansk</p>
                      <p className="text-[11px] opacity-75">Данська мова</p>
                    </div>
                    {currentLanguage === 'da' && <Check className="w-4 h-4 text-amber-500 stroke-[2.5]" />}
                  </button>

                  <button
                    onClick={() => {
                      haptic.tap();
                      onUpdateLanguage('en');
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      currentLanguage === 'en'
                        ? 'border-amber-400 bg-amber-400/10 text-amber-900 dark:text-amber-300 font-semibold'
                        : 'border-zinc-200 dark:border-white/5 hover:border-zinc-300 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold">English</p>
                      <p className="text-[11px] opacity-75">Англійська мова</p>
                    </div>
                    {currentLanguage === 'en' && <Check className="w-4 h-4 text-amber-500 stroke-[2.5]" />}
                  </button>
                </div>
              </div>

              {/* Voice Selector Inset Card */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#141418] border border-zinc-200/80 dark:border-white/5">
                <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
                  Голос ШІ-співрозмовника ({currentLanguage === 'da' ? 'Dansk' : 'English'})
                </label>
                <div className="space-y-2">
                  {voicesForLanguage.map((v) => {
                    const isSelected = currentVoice === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          haptic.tap();
                          onUpdateVoice(v.id);
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-amber-400 bg-amber-400/10 text-amber-900 dark:text-amber-300 font-semibold'
                            : 'border-zinc-200 dark:border-white/5 hover:border-zinc-300 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        <span className="text-xs font-medium">{v.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-amber-500 stroke-[2.5]" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* User Account Inset Card */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#141418] border border-zinc-200/80 dark:border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {user?.name || 'Гість'}
                  </p>
                  <p className="text-[11px] text-zinc-500 font-mono">{user?.email || 'Не авторизовано'}</p>
                </div>

                {isLoggedIn ? (
                  <button
                    onClick={() => {
                      haptic.tap();
                      onLogout();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Вийти</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      haptic.impact();
                      onLogin();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-400 text-zinc-950 text-xs font-semibold hover:bg-amber-300 transition-colors cursor-pointer"
                  >
                    Увійти
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Memory Scope Pills */}
              <div className="flex gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-[#141418]">
                {(['global', 'da', 'en'] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => {
                      haptic.tap();
                      setMemoryScope(scope);
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      memoryScope === scope
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    {scope === 'global' ? 'Загальні' : scope === 'da' ? 'Данська' : 'Англійська'}
                  </button>
                ))}
              </div>

              {/* Add Fact Form */}
              <form onSubmit={handleAddFact} className="flex gap-2">
                <input
                  type="text"
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  placeholder="Додати факт про себе (напр. рівень мови)..."
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={!newFact.trim() || isSaving}
                  className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </button>
              </form>

              {/* Facts List */}
              <div className="space-y-2">
                {currentFactList.length === 0 ? (
                  <p className="text-center py-6 text-xs text-zinc-400">
                    Немає збережених фактів для цієї категорії
                  </p>
                ) : (
                  currentFactList.map((fact, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-[#141418] border border-zinc-200/80 dark:border-white/5"
                    >
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug flex-1">
                        {fact}
                      </p>
                      <button
                        onClick={() => handleDeleteFact(idx)}
                        className="p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
