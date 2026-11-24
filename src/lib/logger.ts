// language: TypeScript, file: src/lib/logger.ts, target: Web

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  at: string;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
}

const MAX_BUFFER = 250;
const buffer: LogEntry[] = [];
const isDev = Boolean(import.meta.env.DEV);

function write(level: LogLevel, scope: string, message: string, data?: unknown) {
  if (level === 'debug' && !isDev) return;

  const entry: LogEntry = {
    at: new Date().toISOString(),
    level,
    scope,
    message,
    ...(data === undefined ? {} : { data })
  };

  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  const line = `[FastLearn/${scope}] ${message}`;
  if (level === 'error') {
    console.error(line, data ?? '');
  } else if (level === 'warn') {
    console.warn(line, data ?? '');
  } else if (level === 'debug') {
    console.debug(line, data ?? '');
  } else {
    console.info(line, data ?? '');
  }
}

export const log = {
  debug: (scope: string, message: string, data?: unknown) => write('debug', scope, message, data),
  info: (scope: string, message: string, data?: unknown) => write('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => write('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => write('error', scope, message, data),
  child: (scope: string) => ({
    debug: (message: string, data?: unknown) => write('debug', scope, message, data),
    info: (message: string, data?: unknown) => write('info', scope, message, data),
    warn: (message: string, data?: unknown) => write('warn', scope, message, data),
    error: (message: string, data?: unknown) => write('error', scope, message, data)
  })
};

export function recentLogs(): LogEntry[] {
  return buffer.slice();
}

function describeError(value: unknown) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function installGlobalLogging() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    log.error('window', 'Uncaught error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: describeError(event.error)
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    log.error('window', 'Unhandled promise rejection', describeError(event.reason));
  });

  log.info('app', 'Global error logging installed');
}

export { describeError };
