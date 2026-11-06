import React, { useState } from 'react';
import { X, Eye, EyeOff, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
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

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Введіть ключ API перед перевіркою' });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-white rounded-2xl border border-stone-200 shadow-2xl p-4 sm:p-6 z-10 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
          <h2 className="font-semibold text-base text-stone-900 tracking-tight">
            Налаштування
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-900 rounded transition-colors"
            aria-label="Закрити"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-medium text-stone-800">
                Gemini API Ключ
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-stone-500 hover:text-stone-900 flex items-center gap-1"
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
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-700"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleTestKey}
                disabled={testing}
                className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium rounded-lg text-xs flex items-center gap-1 disabled:opacity-50"
              >
                {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Тест</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`mt-2 p-2 rounded-lg text-xs flex items-start gap-1.5 ${
                  testResult.success ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
                }`}
              >
                {testResult.success ? (
                  <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
            <p className="text-[10px] text-stone-400 mt-1">
              Зберігається суто локально у вашому браузері.
            </p>
          </div>

          {/* Model selection */}
          <div>
            <label className="font-medium text-stone-800 block mb-1.5">
              Модель Gemini
            </label>
            <div className="space-y-1.5 mb-2">
              {AVAILABLE_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                    !isCustomModel && model === m.id
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-800'
                  }`}
                  onClick={() => {
                    setIsCustomModel(false);
                    setModel(m.id);
                  }}
                >
                  <div>
                    <div className="font-mono text-xs font-semibold">{m.name}</div>
                    <div className={`text-[11px] ${!isCustomModel && model === m.id ? 'text-stone-300' : 'text-stone-500'}`}>
                      {m.desc}
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="modelSelection"
                    checked={!isCustomModel && model === m.id}
                    onChange={() => {}}
                    className="accent-white"
                  />
                </label>
              ))}

              <label
                className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                  isCustomModel
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-800'
                }`}
                onClick={() => setIsCustomModel(true)}
              >
                <div className="w-full mr-2">
                  <div className="font-mono text-xs font-semibold">Власна модель</div>
                  {isCustomModel && (
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="gemini-3.5-flash-lite або gemma-2-27b-it"
                      className="w-full mt-1.5 px-2.5 py-1 text-xs bg-stone-800 text-white rounded border border-stone-700 font-mono focus:outline-none"
                    />
                  )}
                </div>
                <input
                  type="radio"
                  name="modelSelection"
                  checked={isCustomModel}
                  onChange={() => {}}
                  className="accent-white"
                />
              </label>
            </div>
          </div>

          {/* Level selection */}
          <div>
            <label className="font-medium text-stone-800 block mb-1.5">
              Рівень датської
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['A1', 'A2', 'B1', 'B2', 'C1'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`py-1.5 text-xs font-mono rounded-lg transition-colors ${
                    level === lvl
                      ? 'bg-stone-900 text-white font-semibold'
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Speech Rate */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-medium text-stone-800">
                Швидкість вимови
              </label>
              <span className="font-mono text-stone-500">{speechRate}x</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[0.75, 1.0, 1.25].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setSpeechRate(rate)}
                  className={`py-1.5 text-xs font-mono rounded-lg transition-colors ${
                    speechRate === rate
                      ? 'bg-stone-900 text-white font-semibold'
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* User Notes */}
          <div>
            <label className="font-medium text-stone-800 block mb-1.5">
              Вказівки для тьютора
            </label>
            <textarea
              rows={2}
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="Наприклад: виправляй кожну дрібну граматичну помилку..."
              className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900 font-sans resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-stone-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 rounded-lg"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
};
