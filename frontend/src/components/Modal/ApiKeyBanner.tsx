import React from 'react';
import { KeyRound, ArrowRight } from 'lucide-react';

interface ApiKeyBannerProps {
  onOpenSettings: () => void;
}

export const ApiKeyBanner: React.FC<ApiKeyBannerProps> = ({ onOpenSettings }) => {
  return (
    <div className="bg-stone-100 border-b border-stone-200 px-4 py-2 text-stone-800 text-xs font-sans">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound className="w-3.5 h-3.5 text-stone-600 shrink-0" />
          <span className="truncate">
            Для запуску діалогу потрібен Gemini API ключ.
          </span>
        </div>

        <button
          onClick={onOpenSettings}
          className="shrink-0 flex items-center gap-1 font-medium text-stone-900 hover:text-black hover:underline cursor-pointer"
        >
          <span>Налаштувати</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
