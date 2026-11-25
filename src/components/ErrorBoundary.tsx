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
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f4f2] px-5 text-[#111113] dark:bg-[#0c0c0e] dark:text-zinc-100">
        <div className="w-full max-w-md rounded-md border border-black/[0.12] bg-white p-6 dark:border-white/[0.12] dark:bg-[#141416]">
          <span className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <h1 className="mt-4 text-[18px] font-medium">Щось зламалося на цьому екрані</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            Діалоги, слова та налаштування збережені на цьому пристрої. Перезавантажте сторінку, щоб продовжити.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-[4px] border border-black/[0.08] bg-[#f4f4f2] p-3 font-mono text-[11px] leading-relaxed text-zinc-700 dark:border-white/[0.08] dark:bg-[#0c0c0e] dark:text-zinc-300">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[#111113] px-4 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-[#111113] dark:hover:bg-white"
          >
            <RotateCw className="h-4 w-4" strokeWidth={1.75} />
            Перезавантажити
          </button>
        </div>
      </div>
    );
  }
}
