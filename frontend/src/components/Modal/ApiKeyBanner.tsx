import React from 'react';
import { KeyRound, ExternalLink } from 'lucide-react';

interface ApiKeyBannerProps {
  onOpenSettings: () => void;
}

export const ApiKeyBanner: React.FC<ApiKeyBannerProps> = ({ onOpenSettings }) => {
  return (
    <div className="bg-amber-300 border-b-2 border-black p-3 text-black">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 shrink-0 text-black" />
          <span>
            <strong>УВАГА:</strong> Потрібен ключ Google Gemini API для спілкування з ШІ-тьютором. Сайт працює 100% статично на вашому клієнті.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenSettings}
            className="brutal-btn px-2.5 py-1 bg-black text-white text-xs font-mono font-bold cursor-pointer"
          >
            Ввести ключ
          </button>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 bg-white border border-black hover:bg-zinc-100 flex items-center gap-1 text-black text-xs font-mono"
          >
            <span>Отримати ключ</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
