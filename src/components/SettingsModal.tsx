import React from 'react';
import { User, Language } from '../types.ts';
import { X, LogOut, Volume2, Globe, UserCheck } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  currentLanguage: Language;
  onUpdateLanguage: (lang: Language) => void;
  currentVoice: string;
  onUpdateVoice: (voice: string) => void;
  onLogout: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  currentLanguage,
  onUpdateLanguage,
  currentVoice,
  onUpdateVoice,
  onLogout
}) => {
  if (!isOpen) return null;

  const voicesForLanguage = currentLanguage === 'da'
    ? [
        { id: 'da-DK-ChristelNeural', label: 'Christel (Kvindelig / Female)' },
        { id: 'da-DK-JeppeNeural', label: 'Jeppe (Mandlig / Male)' }
      ]
    : [
        { id: 'en-US-JennyNeural', label: 'Jenny (US Female)' },
        { id: 'en-US-GuyNeural', label: 'Guy (US Male)' }
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-sm bg-[#121215] border border-white/20 rounded-lg shadow-2xl p-4 text-[#f4f4f5] z-10 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100 uppercase font-mono">
            Налаштування / Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Account Section */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 uppercase">
            <UserCheck className="w-3.5 h-3.5 text-amber-400" />
            Акаунт (Google)
          </label>
          <div className="flex items-center justify-between p-2.5 rounded bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-7 h-7 rounded-full border border-white/20 object-cover shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-zinc-200 truncate">{user.name}</div>
                <div className="text-[10px] text-zinc-500 font-mono truncate">{user.email}</div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-mono transition-colors shrink-0"
              title="Змінити акаунт / Log out"
            >
              <LogOut className="w-3 h-3" />
              <span>Вийти</span>
            </button>
          </div>
        </div>

        {/* 2. Target Language */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 uppercase">
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            Мова вивчення / Target Language
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateLanguage('da')}
              className={`py-2 px-3 rounded border text-xs font-mono transition-all text-left ${
                currentLanguage === 'da'
                  ? 'border-amber-400 bg-amber-400/10 text-amber-300 font-medium'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-400'
              }`}
            >
              <div className="text-sm mb-0.5">🇩🇰 Dansk</div>
              <div className="text-[10px] text-zinc-500">Датська</div>
            </button>

            <button
              onClick={() => onUpdateLanguage('en')}
              className={`py-2 px-3 rounded border text-xs font-mono transition-all text-left ${
                currentLanguage === 'en'
                  ? 'border-amber-400 bg-amber-400/10 text-amber-300 font-medium'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-400'
              }`}
            >
              <div className="text-sm mb-0.5">🇬🇧 English</div>
              <div className="text-[10px] text-zinc-500">Англійська</div>
            </button>
          </div>
        </div>

        {/* 3. Voice Selector (Edge-TTS) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 uppercase">
            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            Голос озвучення (Edge-TTS)
          </label>
          <div className="space-y-1">
            {voicesForLanguage.map((v) => (
              <label
                key={v.id}
                className={`flex items-center justify-between p-2 rounded border cursor-pointer text-xs font-mono transition-colors ${
                  currentVoice === v.id
                    ? 'border-amber-400/60 bg-amber-400/10 text-amber-300'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300'
                }`}
              >
                <span>{v.label}</span>
                <input
                  type="radio"
                  name="voice"
                  value={v.id}
                  checked={currentVoice === v.id}
                  onChange={() => onUpdateVoice(v.id)}
                  className="accent-amber-400"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Info notice */}
        <div className="pt-2 border-t border-white/10 text-[10px] font-mono text-zinc-500 text-center">
          Авто-озвучення виділення: <span className="text-amber-400">0.80x</span> · Прискорення: 0.85x / 0.60x
        </div>
      </div>
    </div>
  );
};
