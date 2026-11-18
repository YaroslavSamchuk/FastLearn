import React, { useState } from 'react';
import { X, Eye, EyeOff, Check, AlertCircle, Loader2, ExternalLink, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
import type { AppSettings } from '../../types';
import type { AntigravityUser } from 'antigravity-client';
import { AVAILABLE_MODELS, GeminiService } from '../../services/gemini';
import { isLocalhost, updateClientProxyUrl } from '../../services/antigravity';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  user: AntigravityUser | null;
  isAuthenticated: boolean;
  onLoginGoogle: () => void;
  onLogoutGoogle: () => void;
  onSave: (updated: Partial<AppSettings>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  user,
  isAuthenticated,
  onLoginGoogle,
  onLogoutGoogle,
  onSave,
  onClose,
}) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [proxyUrl, setProxyUrl] = useState(settings.proxyUrl || '');
  const [model, setModel] = useState(settings.model);
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(!AVAILABLE_MODELS.some(m => m.id === settings.model));
  const [level, setLevel] = useState(settings.level);
  const [userNotes, setUserNotes] = useState(settings.userNotes);
  const [speechRate, setSpeechRate] = useState(settings.speechRate);
  const [showKey, setShowKey] = useState(false);
  const [showLegacyKeySection, setShowLegacyKeySection] = useState(
    Boolean(!isLocalhost || settings.apiKey || !isAuthenticated || settings.proxyUrl)
  );

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    updateClientProxyUrl(proxyUrl.trim());
    const activeModel = isCustomModel && customModel.trim() ? customModel.trim() : model;
    const res = await GeminiService.testConnection(apiKey, activeModel);
    setTesting(false);
    setTestResult(res);
  };

  const handleSave = () => {
    const finalModel = isCustomModel && customModel.trim() ? customModel.trim() : model;
    updateClientProxyUrl(proxyUrl.trim());
    onSave({
      apiKey: apiKey.trim(),
      proxyUrl: proxyUrl.trim(),
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
          <div>
            <h2 className="font-semibold text-base text-stone-900 tracking-tight">
              Налаштування
            </h2>
            <p className="text-[11px] text-stone-500">
              Авторизація через Antigravity Client & параметри навчання
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-900 rounded transition-colors cursor-pointer"
            aria-label="Закрити"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Google OAuth Section (Primary) */}
          <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-stone-900 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Google OAuth (Antigravity)
              </span>

              {isAuthenticated && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Підключено
                </span>
              )}
            </div>

            {isAuthenticated && user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-stone-200">
                  {user.picture ? (
                    <img src={user.picture} alt="Avatar" className="w-8 h-8 rounded-full border border-stone-200" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-stone-900 text-white flex items-center justify-center font-bold text-xs">
                      {(user.name?.[0] || user.email?.[0] || 'G').toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-stone-900 truncate">
                      {user.name || 'Авторизований користувач'}
                    </div>
                    <div className="text-[11px] text-stone-500 truncate">
                      {user.email || 'Google One AI Premium'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="flex-1 py-1.5 px-3 bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 font-medium rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    <span>Перевірити зв'язок</span>
                  </button>

                  <button
                    type="button"
                    onClick={onLogoutGoogle}
                    className="py-1.5 px-3 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-medium rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Вийти</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {isLocalhost ? (
                  <p className="text-[11px] text-stone-600">
                    Вхід в один клік без API ключів, налаштування Google Cloud чи платіжних даних.
                  </p>
                ) : (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[10.5px] leading-relaxed">
                    <strong>Примітка для веб-хостингу (Koyeb / Cloud):</strong> Офіційний Google OAuth клієнт Antigravity авторизовано для локального запуску (<code className="font-mono bg-amber-100 px-1 rounded">localhost</code>). Для віддаленого веб-хостингу використовуйте <strong>Gemini API Ключ</strong> нижче.
                  </div>
                )}

                <button
                  type="button"
                  onClick={onLoginGoogle}
                  className="w-full py-2 px-3 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <svg width="15" height="15" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  <span>Увійти через Google OAuth</span>
                </button>
              </div>
            )}

            {testResult && (
              <div
                className={`mt-2.5 p-2 rounded-lg text-xs flex items-start gap-1.5 ${
                  testResult.success ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-red-50 text-red-900 border border-red-200'
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
          </div>

          {/* Model selection */}
          <div>
            <label className="font-medium text-stone-800 block mb-1.5">
              Модель ШІ
            </label>
            <div className="space-y-1.5 mb-2 max-h-52 overflow-y-auto pr-1">
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
                  <div className="mr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold">{m.name}</span>
                      {m.badge && (
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-sans ${
                          !isCustomModel && model === m.id ? 'bg-stone-700 text-stone-200' : 'bg-stone-200 text-stone-700'
                        }`}>
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] ${!isCustomModel && model === m.id ? 'text-stone-300' : 'text-stone-500'}`}>
                      {m.desc}
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="modelSelection"
                    checked={!isCustomModel && model === m.id}
                    onChange={() => {}}
                    className="accent-white shrink-0"
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
                      placeholder="gemini-3.5-flash-lite або інша"
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
                  className={`py-1.5 text-xs font-mono rounded-lg transition-colors cursor-pointer ${
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
                  className={`py-1.5 text-xs font-mono rounded-lg transition-colors cursor-pointer ${
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

          {/* Optional Legacy API Key Section */}
          <div className="pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setShowLegacyKeySection(!showLegacyKeySection)}
              className="w-full flex items-center justify-between text-[11px] text-stone-500 hover:text-stone-800 py-1 cursor-pointer"
            >
              <span>Резервний варіант: Gemini API Ключ</span>
              {showLegacyKeySection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showLegacyKeySection && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-stone-400">
                    Не обов'язково, якщо ви увійшли через Google
                  </span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-stone-500 hover:text-stone-900 flex items-center gap-1"
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
                </div>

                {/* Cloudflare Worker / Custom Proxy URL */}
                <div className="pt-2 border-t border-stone-100">
                  <label className="font-medium text-stone-700 block mb-1">
                    URL проксі Antigravity (для Cloudflare Worker)
                  </label>
                  <input
                    type="text"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="https://fastlearn-proxy.your-subdomain.workers.dev"
                    className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-stone-900 font-mono text-[11px]"
                  />
                  <p className="text-[10px] text-stone-400 mt-1 leading-tight">
                    Потрібно, якщо ви хостите сайт на GitHub Pages з окремим Cloudflare Worker. Для Cloudflare Pages або Koyeb залиште порожнім.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-stone-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 rounded-lg cursor-pointer"
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
