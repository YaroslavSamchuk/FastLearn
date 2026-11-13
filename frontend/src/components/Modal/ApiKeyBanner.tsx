import React from 'react';
import { ArrowRight, Sparkles, KeyRound } from 'lucide-react';
import { isLocalhost } from '../../services/antigravity';

interface ApiKeyBannerProps {
  onLoginGoogle: () => void;
  onOpenSettings: () => void;
}

export const ApiKeyBanner: React.FC<ApiKeyBannerProps> = ({
  onLoginGoogle,
  onOpenSettings,
}) => {
  if (isLocalhost) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 sm:px-4 py-2 text-stone-800 text-xs font-sans">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate text-stone-700">
              Працюйте без API-ключів через <strong className="font-semibold text-stone-900">Google OAuth</strong> (Gemini 3.8, Claude, GPT-OSS).
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onLoginGoogle}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-lg text-[11px] shadow-sm transition-all cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Увійти через Google</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-900 cursor-pointer"
            >
              <span>Налаштування</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Cloud / remote web hosting (e.g. Koyeb / Web)
  return (
    <div className="bg-stone-100 border-b border-stone-200 px-3 sm:px-4 py-2 text-stone-800 text-xs font-sans">
      <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound className="w-3.5 h-3.5 text-stone-600 shrink-0" />
          <span className="truncate text-stone-700">
            Для запуску бесіди вкажіть <strong className="font-semibold text-stone-900">Gemini API Ключ</strong> у налаштуваннях.
          </span>
        </div>

        <button
          onClick={onOpenSettings}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-lg text-[11px] shadow-sm transition-all cursor-pointer"
        >
          <span>Вказати ключ</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
