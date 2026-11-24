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
      <div className="flex min-h-[100dvh] items-center justify-center bg-stone-50 px-5 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-stone-900">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Щось зламалося на цьому екрані</h1>
          <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Діалоги, слова та налаштування збережені на цьому пристрої. Перезавантажте сторінку, щоб
            продовжити.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-stone-100 p-3 text-[11px] leading-relaxed text-stone-700 dark:bg-stone-950 dark:text-stone-300">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white"
          >
            <RotateCw className="h-4 w-4" strokeWidth={1.8} />
            Перезавантажити
          </button>
        </div>
      </div>
    );
  }
}
