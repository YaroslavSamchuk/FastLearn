// language: TypeScript, file: src/lib/storage.ts, target: Web

import { log } from './logger';

export const storageKeys = {
  theme: 'fastlearn_theme',
  user: 'fastlearn_user',
  data: 'fastlearn.data.v2',
  pendingGoogleLogin: 'fastlearn.oauth.pending'
} as const;

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    log.warn('storage', `Could not read ${key}`, {
      error: error instanceof Error ? error.message : String(error)
    });
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    log.error('storage', `Could not write ${key}`, {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

export function removeKey(key: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    log.warn('storage', `Could not remove ${key}`, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function readString(key: string): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    log.warn('storage', `Could not write ${key}`, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function readSessionJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSessionJson(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session storage is optional; OAuth still works without persistence.
  }
}

export function removeSessionKey(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}
