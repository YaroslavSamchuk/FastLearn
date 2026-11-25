// language: TypeScript (React), file: src/components/ErrorBoundary.tsx, target: Web
import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { log } from '../lib/logger';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('react', 'Render crash caught by the error boundary', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[var(--app-height,100dvh)] items-center justify-center bg-[#f6f5f1] px-5 text-[#1c1917] dark:bg-[#161513] dark:text-[#efede8]">
        <div className="w-full max-w-md rounded-xl border border-black/[0.08] bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:bg-[#1c1a18] dark:shadow-none">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-600/20 bg-red-600/10 text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
          </span>
          <h1 className="mt-4 text-[18px] font-medium">Щось зламалося на цьому екрані</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#57534e] dark:text-[#a8a29a]">
            Діалоги, слова та налаштування збережені на цьому пристрої. Перезавантажте сторінку, щоб продовжити.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-black/[0.08] bg-[#f6f5f1] p-3 font-mono text-[12px] leading-relaxed text-[#57534e] dark:border-white/[0.08] dark:bg-[#121110] dark:text-[#a8a29a]">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#1c1917] px-4 text-[14px] font-medium text-[#f6f5f1] transition-[background-color,transform] duration-150 ease-unslop hover:bg-[#342e2a] active:scale-[0.98] dark:bg-[#efede8] dark:text-[#161513] dark:hover:bg-white"
          >
            <RotateCw className="h-4 w-4" strokeWidth={1.5} />
            Перезавантажити
          </button>
        </div>
      </div>
    );
  }
}
