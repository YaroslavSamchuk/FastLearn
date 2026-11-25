// language: TypeScript, file: src/lib/api.ts, target: Web

import { ChatTurn, Language, MemoryToolEvent, UserMemories } from '../types.ts';
import { normalizeAssistantText } from '../utils/textTokens.ts';
import { log } from './logger';

const API_SCOPE = 'api';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function getSessionUser(): Promise<{
  id: string;
  name: string;
  email: string;
  avatar: string;
  currentLanguage: 'da' | 'en';
} | null> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);
  const data = await response.json() as {
    user?: {
      id: string;
      name: string;
      email: string;
      avatar: string;
      currentLanguage: 'da' | 'en';
    } | null;
  };
  return data.user ?? null;
}

export async function logoutSession(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin'
  });
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);
}

export async function getWorkspace(): Promise<Record<string, unknown>> {
  const response = await fetch('/api/workspace', { credentials: 'same-origin' });
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);
  const data = await response.json() as { workspace: Record<string, unknown> };
  return data.workspace;
}

export async function saveWorkspace(workspace: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/workspace', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workspace)
  });
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);
}

interface StreamChatOptions {
  messages: ChatTurn[];
  language: Language;
  memories: UserMemories;
  signal?: AbortSignal;
  onText: (text: string) => void;
  onMemory?: (event: MemoryToolEvent) => void;
}

interface StreamChatResult {
  text: string;
  model?: string;
  status: number;
}

export interface TranscribeResult {
  original: string;
  translation: string;
  ipa: string;
  sourceLang?: string;
  userLang?: string;
}

interface HealthResponse {
  status: string;
  provider?: string;
  models?: string[];
  database?: string;
}

function requestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {
    // fall through
  }
  return Math.random().toString(36).slice(2, 10);
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as { error?: string; message?: string };
      return body.error || body.message || `HTTP ${response.status}`;
    }
    const text = await response.text();
    return text.trim().slice(0, 300) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function parseSseEvent(
  raw: string
): { token?: string; error?: string; memory?: MemoryToolEvent; done?: boolean } | null {
  const dataLines = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) return null;
  const payload = dataLines.join('\n').trim();
  if (!payload) return null;
  if (payload === '[DONE]') return { done: true };

  try {
    const parsed = JSON.parse(payload) as {
      token?: unknown;
      error?: unknown;
      memory?: { action?: unknown; fact?: unknown; previousFact?: unknown; scope?: unknown };
      message?: unknown;
    };
    if (typeof parsed.error === 'string') return { error: parsed.error };
    if (typeof parsed.token === 'string') return { token: parsed.token };
    if (
      parsed.memory &&
      typeof parsed.memory.fact === 'string' &&
      (parsed.memory.action === 'save' ||
        parsed.memory.action === 'update' ||
        parsed.memory.action === 'forget') &&
      (parsed.memory.scope === 'global' || parsed.memory.scope === 'da' || parsed.memory.scope === 'en')
    ) {
      return {
        memory: {
          action: parsed.memory.action,
          fact: parsed.memory.fact,
          scope: parsed.memory.scope,
          ...(typeof parsed.memory.previousFact === 'string'
            ? { previousFact: parsed.memory.previousFact }
            : {})
        }
      };
    }
    return null;
  } catch {
    log.warn(API_SCOPE, 'Ignoring malformed SSE event', { payload: payload.slice(0, 120) });
    return null;
  }
}

export async function streamChat({
  messages,
  language,
  memories,
  signal,
  onText,
  onMemory
}: StreamChatOptions): Promise<StreamChatResult> {
  const id = requestId();
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), 90_000);

  const forwardAbort = () => controller.abort(new DOMException('Request cancelled', 'AbortError'));
  signal?.addEventListener('abort', forwardAbort, { once: true });

  log.info(API_SCOPE, 'Chat request started', {
    id,
    language,
    turns: messages.length,
    chars: messages.reduce((sum, message) => sum + message.content.length, 0)
  });

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, language, memories }),
      signal: controller.signal
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new ApiError(message, response.status);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      const message = await readErrorMessage(response);
      throw new ApiError(message || 'Unexpected response from the model', response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new ApiError('Response stream is unavailable', 0);

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let streamError: string | null = null;
    let done = false;

    const consume = (raw: string) => {
      const event = parseSseEvent(raw);
      if (!event) return;
      if (event.done) {
        done = true;
        return;
      }
      if (event.error) {
        streamError = event.error;
        return;
      }
      if (event.memory) {
        onMemory?.(event.memory);
        return;
      }
      if (event.token) {
        text += event.token;
        onText(normalizeAssistantText(text));
      }
    };

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        consume(raw);
        boundary = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) consume(buffer);

    if (streamError) throw new ApiError(streamError, 502);
    if (!text.trim()) throw new ApiError('The model returned an empty reply', 502);

    const duration = Math.round(performance.now() - startedAt);
    const model = response.headers.get('x-fastlearn-model') || undefined;
    log.info(API_SCOPE, 'Chat request finished', {
      id,
      duration,
      chars: text.length,
      model
    });

    return { text: normalizeAssistantText(text.trim()), model, status: response.status };
  } catch (error) {
    const duration = Math.round(performance.now() - startedAt);
    if (error instanceof DOMException && error.name === 'AbortError') {
      log.warn(API_SCOPE, 'Chat request cancelled', { id, duration });
    } else {
      log.error(API_SCOPE, 'Chat request failed', {
        id,
        duration,
        status: error instanceof ApiError ? error.status : undefined,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export async function transcribe(text: string, language: Language): Promise<TranscribeResult> {
  const id = requestId();
  const startedAt = performance.now();
  log.info(API_SCOPE, 'Translation request started', { id, language, chars: text.length });

  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: language, userLang: 'uk' })
    });

    if (!response.ok) {
      throw new ApiError(await readErrorMessage(response), response.status);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new ApiError('Translation service returned an unexpected format', response.status);
    }

    const result = (await response.json()) as TranscribeResult;
    if (!result || typeof result.translation !== 'string') {
      throw new ApiError('Translation service returned an empty result', response.status);
    }

    log.info(API_SCOPE, 'Translation request finished', {
      id,
      duration: Math.round(performance.now() - startedAt)
    });
    return result;
  } catch (error) {
    log.error(API_SCOPE, 'Translation request failed', {
      id,
      duration: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function translateSelection(
  text: string,
  language: Language,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang: language, userLang: 'uk' }),
    signal
  });
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);

  const data = await response.json() as { translation?: unknown };
  if (typeof data.translation !== 'string' || !data.translation.trim()) {
    throw new ApiError('Translation service returned an empty result', response.status);
  }
  return data.translation.trim();
}

export async function getPronunciation(
  text: string,
  language: Language,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch('/api/ipa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang: language }),
    signal
  });
  if (!response.ok) throw new ApiError(await readErrorMessage(response), response.status);

  const data = await response.json() as { ipa?: unknown };
  return typeof data.ipa === 'string' ? data.ipa : '';
}

export async function fetchSpeechAudio(
  text: string,
  language: Language,
  speed: number,
  signal?: AbortSignal,
  voice?: string
): Promise<Blob> {
  const response = await fetch(ttsUrl(text, language, speed, voice), { signal });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('audio')) {
    throw new ApiError(
      `TTS returned HTTP ${response.status} (${contentType || 'no content type'})`,
      response.status
    );
  }

  const audio = await response.blob();
  if (audio.size === 0) throw new ApiError('TTS returned an empty audio file', response.status);
  return audio;
}

export function ttsUrl(text: string, language: Language, speed: number, voice?: string): string {
  const query = new URLSearchParams({
    text,
    lang: language,
    speed: String(speed)
  });
  if (voice) query.set('voice', voice);
  return `/api/tts?${query.toString()}`;
}

function decodeBase64Audio(audioBase64: string): Blob {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'audio/mpeg' });
}

export function createSpeechBatchLoader(
  text: string,
  language: Language,
  speeds: readonly number[],
  voice?: string
): (speed: number) => Promise<Blob> {
  const pending = new Map<
    number,
    { settled: boolean; resolve: (audio: Blob) => void; reject: (error: unknown) => void; promise: Promise<Blob> }
  >();

  for (const speed of speeds) {
    let resolve!: (audio: Blob) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Blob>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    pending.set(speed, { settled: false, resolve, reject, promise });
  }

  const fallbackRemaining = () => {
    for (const [speed, entry] of pending.entries()) {
      if (entry.settled) continue;
      entry.settled = true;
      fetchSpeechAudio(text, language, speed, undefined, voice).then(entry.resolve, entry.reject);
    }
  };

  void (async () => {
    try {
      const response = await fetch('/api/tts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          lang: language,
          speeds,
          ...(voice ? { voice } : {})
        })
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || !contentType.includes('ndjson') || !response.body) {
        fallbackRemaining();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;
        let parsed: { speed?: unknown; audioBase64?: unknown; error?: unknown };
        try {
          parsed = JSON.parse(line) as { speed?: unknown; audioBase64?: unknown; error?: unknown };
        } catch {
          return;
        }
        const speed = Number(parsed.speed);
        const entry = pending.get(speed);
        if (!entry || entry.settled) return;

        if (typeof parsed.audioBase64 === 'string' && parsed.audioBase64) {
          const blob = decodeBase64Audio(parsed.audioBase64);
          if (blob.size > 0) {
            entry.settled = true;
            entry.resolve(blob);
            return;
          }
        }

        entry.settled = true;
        fetchSpeechAudio(text, language, speed, undefined, voice).then(entry.resolve, entry.reject);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          handleLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
        }
      }

      if (buffer.trim()) handleLine(buffer);
      fallbackRemaining();
    } catch {
      fallbackRemaining();
    }
  })();

  return (speed: number) =>
    pending.get(speed)?.promise ?? fetchSpeechAudio(text, language, speed, undefined, voice);
}

export async function generateChatTitle(message: string, language: Language): Promise<string> {
  const fallback = message.slice(0, 36).trim();
  const safeFallback = fallback
    ? fallback.charAt(0).toUpperCase() + fallback.slice(1)
    : language === 'da'
      ? 'Ny samtale'
      : 'New conversation';

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const response = await fetch('/api/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, language }),
      signal: controller.signal
    });
    window.clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as { title?: string };
      if (data.title && typeof data.title === 'string' && data.title.trim()) {
        return data.title.trim();
      }
    }
  } catch (error) {
    log.warn(API_SCOPE, 'Failed to fetch generated title', { error: String(error) });
  }

  return safeFallback;
}

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok) throw new ApiError(`Health check failed with HTTP ${response.status}`, response.status);
  return (await response.json()) as HealthResponse;
}
