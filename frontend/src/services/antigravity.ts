import { Antigravity, LocalStorageAdapter } from 'antigravity-client';
import type { AntigravityUser } from 'antigravity-client';

// Resolves proxy URL from settings, env, or falls back to window.location.origin
export function getProxyBaseUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem('fastlearn_v2_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.proxyUrl && parsed.proxyUrl.trim()) {
        return parsed.proxyUrl.trim().replace(/\/+$/, '');
      }
    }
  } catch {}
  const envProxy = import.meta.env.VITE_ANTIGRAVITY_PROXY_URL;
  if (envProxy && envProxy.trim()) {
    return envProxy.trim().replace(/\/+$/, '');
  }
  return window.location.origin;
}

// Client initialized with localStorage persistence and edge/browser proxy
export const ag = new Antigravity({
  storage: new LocalStorageAdapter(),
  baseUrl: getProxyBaseUrl(),
  defaultModel: 'gemini-3.8-flash-high',
});

export function updateClientProxyUrl(url?: string) {
  const target = url?.trim() || getProxyBaseUrl();
  (ag as any).baseUrl = target;
}

export interface ModelOption {
  id: string;
  name: string;
  desc: string;
  badge?: string;
}

export const ANTIGRAVITY_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.8-flash-high',
    name: 'Gemini 3.8 Flash (High)',
    desc: 'Флагманська модель Google: блискавична швидкість та найвища точність',
    badge: 'Рекомендовано',
  },
  {
    id: 'gemini-3.8-flash-medium',
    name: 'Gemini 3.8 Flash (Medium)',
    desc: 'Оптимальний баланс між швидкістю та глибиною',
  },
  {
    id: 'gemini-3.8-flash-low',
    name: 'Gemini 3.8 Flash (Low)',
    desc: 'Ультрашвидка відповідь для простих реплік',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    desc: 'Виняткова мовна майстерність для складних діалогів та граматики',
    badge: 'Преміум',
  },
  {
    id: 'claude-opus-4-6-thinking',
    name: 'Claude Opus 4.6 (Thinking)',
    desc: 'Потужне мислення та глибокий педагогічний аналіз помилок',
    badge: 'Глибокий аналіз',
  },
  {
    id: 'gpt-oss-120b-medium',
    name: 'GPT-OSS 120B',
    desc: 'Відкрита потужна нейромережа наступного покоління',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    desc: 'Швидка та перевірена стабільна модель',
  },
];

export const DEFAULT_ANTIGRAVITY_MODEL = 'gemini-3.8-flash-high';

export const isLocalhost = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.endsWith('.localhost')
);

export async function checkAuthStatus(): Promise<{ isAuthenticated: boolean; user: AntigravityUser | null }> {
  try {
    const isAuth = await ag.isAuthenticated();
    if (isAuth) {
      const user = await ag.getUser();
      return { isAuthenticated: true, user };
    }
  } catch (e) {
    console.warn('Failed to check Antigravity auth status:', e);
  }
  return { isAuthenticated: false, user: null };
}

export async function loginWithGoogle(): Promise<void> {
  const redirectUri = window.location.origin + window.location.pathname;
  const auth = await ag.getAuthUrl({ redirectUri });
  sessionStorage.setItem('pkce_verifier', auth.codeVerifier);
  window.location.href = auth.url;
}

export async function handleAuthRedirect(): Promise<AntigravityUser | null> {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const verifier = sessionStorage.getItem('pkce_verifier');

  if (code && verifier) {
    try {
      const session = await ag.exchangeCode({
        code,
        codeVerifier: verifier,
        redirectUri: window.location.origin + window.location.pathname,
      });
      return session.user;
    } finally {
      sessionStorage.removeItem('pkce_verifier');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  return null;
}

export async function logoutUser(): Promise<void> {
  await ag.logout();
}
