// language: TypeScript, file: src/lib/auth.ts, target: Web / Google OAuth 2.0

import { log } from './logger';
import {
  readSessionJson,
  removeSessionKey,
  storageKeys,
  writeSessionJson
} from './storage';

export interface GoogleProfile {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

interface PendingLogin {
  state: string;
  nonce: string;
  startedAt: number;
}

interface IdTokenClaims {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  aud?: string;
  iss?: string;
  exp?: number;
  nonce?: string;
}

function randomToken(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function decodeBase64Url(value: string): string {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding > 0) base64 += '='.repeat(4 - padding);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed Google ID token');
  return JSON.parse(decodeBase64Url(parts[1])) as IdTokenClaims;
}

export function goToGoogleLogin(clientId: string): void {
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured');
  }
  log.info('auth', 'Redirecting to server-managed Google account selection');
  window.location.assign('/api/auth/google/start');
}

export async function completeGoogleRedirect(clientId: string): Promise<GoogleProfile | null> {
  const hash = window.location.hash;
  if (!hash || (!hash.includes('id_token=') && !hash.includes('access_token=') && !hash.includes('error='))) {
    return null;
  }

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const hashError = params.get('error');
  const idToken = params.get('id_token');
  const accessToken = params.get('access_token');
  const returnedState = params.get('state');

  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  if (hashError) {
    throw new Error(params.get('error_description') || hashError);
  }

  const pending = readSessionJson<PendingLogin | null>(storageKeys.pendingGoogleLogin, null);
  removeSessionKey(storageKeys.pendingGoogleLogin);

  if (!pending || !returnedState || pending.state !== returnedState) {
    throw new Error('Google login state mismatch. Please try signing in again.');
  }

  if (Date.now() - pending.startedAt > 10 * 60 * 1000) {
    throw new Error('Google login timed out. Please try again.');
  }

  if (idToken) {
    const claims = decodeIdToken(idToken);
    const validIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!validIssuer) throw new Error('Google token has an unexpected issuer');
    if (claims.aud !== clientId) throw new Error('Google token was issued for another client');
    if (!claims.exp || claims.exp * 1000 <= Date.now()) throw new Error('Google token has expired');
    if (claims.nonce !== pending.nonce) throw new Error('Google token nonce mismatch');
    if (!claims.sub || !claims.email) throw new Error('Google token is missing profile data');

    log.info('auth', 'Google ID token verified', { email: claims.email });
    return {
      sub: claims.sub,
      name: claims.name || claims.email.split('@')[0],
      email: claims.email,
      picture: claims.picture
    };
  }

  if (accessToken) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      throw new Error(`Google userinfo failed with HTTP ${response.status}`);
    }
    const profile = (await response.json()) as GoogleProfile;
    if (!profile.sub || !profile.email) throw new Error('Google userinfo is missing profile data');
    log.info('auth', 'Google access token verified', { email: profile.email });
    return profile;
  }

  throw new Error('Google redirect did not include a token');
}
