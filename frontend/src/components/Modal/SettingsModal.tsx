import React, { useState } from 'react';
import { Settings, X, Eye, EyeOff, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import type { AppSettings } from '../../types';
import { AVAILABLE_MODELS, GeminiService } from '../../services/gemini';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  onSave: (updated: Partial<AppSettings>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onSave,
  onClose,
}) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(!AVAILABLE_MODELS.some(m => m.id === settings.model));
  const [level, setLevel] = useState(settings.level);
  const [userNotes, setUserNotes] = useState(settings.userNotes);
  const [speechRate, setSpeechRate] = useState(settings.speechRate);
  const [showKey, setShowKey] = useState(false);

  // Testing API key state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Будь ласка, введіть ключ API перед тестуванням.' });
      return;
    }
    setTesting(true);
    setTestResult(null);

    const activeModel = isCustomModel && customModel.trim() ? customModel.trim() : model;
    const res = await GeminiService.testApiKey(apiKey, activeModel);
    setTesting(false);
    setTestResult(res);
  };

  const handleSave = () => {
    const finalModel = isCustomModel && customModel.trim() ? customModel.trim() : model;
    onSave({
      apiKey: apiKey.trim(),
      model: finalModel,
      level,
      userNotes: userNotes.trim(),
      speechRate,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-white border-2 border-black shadow-[6px_6px_0px_0px_#000000] p-5 z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-black" />
            <h2 className="font-bold text-base tracking-tight font-mono uppercase">
              Налаштування застосунку
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-black hover:text-white border border-black transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-mono font-bold uppercase text-zinc-950">
                Google Gemini API Ключ:
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-blue-700 hover:underline flex items-center gap-0.5"
              >
                <span>Отримати ключ</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 text-sm bg-zinc-50 border-2 border-black focus:outline-none focus:bg-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-2.5 text-zinc-500 hover:text-black"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleTestKey}
                disabled={testing}
                className="brutal-btn px-3 py-2 bg-zinc-100 text-xs font-mono font-bold whitespace-nowrap flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Перевірити</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`mt-2 p-2 border border-black text-xs font-mono flex items-start gap-1.5 ${
                  testResult.success ? 'bg-emerald-100 text-emerald-950' : 'bg-red-100 text-red-950'
                }`}
              >
                {testResult.success ? (
                  <Check className="w-4 h-4 shrink-0 text-emerald-700" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
            <p className="text-[10px] font-mono text-zinc-500 mt-1">
              Ключ зберігається виключно локально у вашому браузері (localStorage) і надсилається тільки на офіційний API endpoint Google.
            </p>
          </div>

          {/* Model selection */}
          <div>
            <label className="text-xs font-mono font-bold uppercase text-zinc-950 block mb-1">
              Модель Gemini:
            </label>
            <div className="grid grid-cols-1 gap-1.5 mb-2">
              {AVAILABLE_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`p-2 border-2 border-black flex items-center justify-between cursor-pointer transition-colors ${
                    !isCustomModel && model === m.id ? 'bg-yellow-200 font-bold' : 'bg-zinc-50 hover:bg-zinc-100'
                  }`}
                  onClick={() => {
                    setIsCustomModel(false);
                    setModel(m.id);
                  }}
                >
                  <div>
                    <div className="text-xs font-mono font-bold">{m.name}</div>
                    <div className="text-[10px] text-zinc-600 font-sans">{m.desc}</div>
                  </div>
                  <input
                    type="radio"
                    name="modelSelection"
                    checked={!isCustomModel && model === m.id}
                    onChange={() => {}}
                    className="accent-black"
                  />
                </label>
              ))}

              <label
                className={`p-2 border-2 border-black flex items-center justify-between cursor-pointer transition-colors ${
                  isCustomModel ? 'bg-yellow-200 font-bold' : 'bg-zinc-50 hover:bg-zinc-100'
                }`}
                onClick={() => setIsCustomModel(true)}
              >
                <div className="w-full mr-2">
                  <div className="text-xs font-mono font-bold">Власна назва моделі</div>
                  {isCustomModel && (
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="наприклад: gemini-3.5-flash-lite або gemma-2-27b-it"
                      className="w-full mt-1 px-2 py-1 text-xs bg-white border border-black font-mono focus:outline-none"
                    />
                  )}
                </div>
                <input
                  type="radio"
                  name="modelSelection"
                  checked={isCustomModel}
                  onChange={() => {}}
                  className="accent-black"
                />
              </label>
            </div>
          </div>

          {/* Level selection */}
          <div>
            <label className="text-xs font-mono font-bold uppercase text-zinc-950 block mb-1">
              Рівень знання датської:
            </label>
            <div className="grid grid-cols-5 gap-1">
              {(['A1', 'A2', 'B1', 'B2', 'C1'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`py-1.5 text-xs font-mono border-2 border-black transition-all ${
                    level === lvl ? 'bg-black text-white font-bold' : 'bg-zinc-50 hover:bg-zinc-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Speech Rate */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-mono font-bold uppercase text-zinc-950">
                Швидкість вимови (TTS):
              </label>
              <span className="text-xs font-mono font-bold">{speechRate}x</span>
            </div>
            <div className="flex gap-1.5">
              {[0.75, 1.0, 1.25].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setSpeechRate(rate)}
                  className={`flex-1 py-1 text-xs font-mono border-2 border-black transition-all ${
                    speechRate === rate ? 'bg-black text-white font-bold' : 'bg-zinc-50 hover:bg-zinc-200'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* User Notes / Custom Instructions */}
          <div>
            <label className="text-xs font-mono font-bold uppercase text-zinc-950 block mb-1">
              Побажання для тьютора (Промпт):
            </label>
            <textarea
              rows={2}
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="Наприклад: виправляй кожну дрібну граматичну помилку, використовуй більше розмовного сленгу..."
              className="w-full p-2 text-xs bg-zinc-50 border-2 border-black focus:outline-none focus:bg-white font-sans resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t-2 border-black flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border-2 border-black text-xs font-mono font-bold bg-zinc-100 hover:bg-zinc-200 cursor-pointer"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="brutal-btn px-5 py-2 bg-black text-white text-xs font-mono font-bold cursor-pointer"
          >
            Зберегти налаштування
          </button>
        </div>
      </div>
    </div>
  );
};
