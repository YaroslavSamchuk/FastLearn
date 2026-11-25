// language: TypeScript, file: worker/index.ts, target: Cloudflare Workers
import { DurableObject } from 'cloudflare:workers';
import { MongoClient, type Document, type Filter, type UpdateFilter } from 'mongodb';
import {
  lookupWordFallbackFromDictionaries,
  resolveWordListPronunciation
} from '../server/ipa.js';
import {
  applyMemoryTool as applyMemoryMutation,
  type MemoryToolEvent
} from '../server/memory.js';
import { getChatLanguageInstruction, getThinkingConfig, lockLatestUserMessage } from '../server/modelConfig.js';
import {
  DEFAULT_PLAYBACK_SPEEDS,
  DEFAULT_VOICES,
  isValidVoice,
  normalizePlaybackSpeeds,
  normalizeVoices,
  resolveVoice
} from '../server/ttsConfig.js';
import { synthesizeEdgeSpeech, synthesizeEdgeSpeechBatch } from './edgeTts';

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  MONGO: DurableObjectNamespace;
  MONGODB_URI: string;
  DB_NAME?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GEMINI_API_KEYS?: string;
  GEMINI_MODELS?: string;
}

type MongoCommand =
  | { operation: 'findOne'; collection: string; filter: Record<string, unknown> }
  | { operation: 'findOneAndDelete'; collection: string; filter: Record<string, unknown> }
  | { operation: 'insertOne'; collection: string; document: Record<string, unknown> }
  | {
      operation: 'updateOne';
      collection: string;
      filter: Record<string, unknown>;
      update: Record<string, unknown>;
      upsert?: boolean;
    }
  | { operation: 'deleteOne'; collection: string; filter: Record<string, unknown> };

function mongoFilter(filter: Record<string, unknown>): Filter<Document> {
  const normalized = { ...filter };
  const expiresAt = normalized.expiresAt;
  if (expiresAt && typeof expiresAt === 'object') {
    const operators = { ...(expiresAt as Record<string, unknown>) };
    if (typeof operators.$gt === 'number') operators.$gt = new Date(operators.$gt);
    normalized.expiresAt = operators;
  }
  return normalized as Filter<Document>;
}

function mongoDocument(document: Record<string, unknown>): Document {
  const normalized = { ...document };
  if (typeof normalized.expiresAt === 'number') normalized.expiresAt = new Date(normalized.expiresAt);
  return normalized;
}

export class MongoDatabase extends DurableObject<Env> {
  private clientPromise?: Promise<MongoClient>;

  private async getDatabase() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const client = new MongoClient(this.env.MONGODB_URI, {
          maxPoolSize: 5,
          minPoolSize: 0,
          serverSelectionTimeoutMS: 8000,
          maxIdleTimeMS: 60_000
        });
        await client.connect();
        const db = client.db(this.env.DB_NAME || 'fastlearn');
        await Promise.all([
          db.collection('users').createIndex({ googleSub: 1 }, { unique: true }),
          db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
          db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          db.collection('oauth_states').createIndex({ state: 1 }, { unique: true }),
          db.collection('oauth_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          db.collection('workspaces').createIndex({ ownerId: 1 }, { unique: true })
        ]);
        return client;
      })();
    }
    return (await this.clientPromise).db(this.env.DB_NAME || 'fastlearn');
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/execute') {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    try {
      const command = await request.json() as MongoCommand;
      const allowedCollections = new Set(['users', 'sessions', 'oauth_states', 'workspaces']);
      if (!allowedCollections.has(command.collection)) {
        return Response.json({ error: 'Unsupported collection' }, { status: 400 });
      }

      const db = await this.getDatabase();
      const collection = db.collection<Document>(command.collection);
      let result: unknown;

      switch (command.operation) {
        case 'findOne':
          result = await collection.findOne(mongoFilter(command.filter));
          break;
        case 'findOneAndDelete':
          result = await collection.findOneAndDelete(mongoFilter(command.filter));
          break;
        case 'insertOne':
          result = await collection.insertOne(mongoDocument(command.document));
          break;
        case 'updateOne':
          result = await collection.updateOne(
            mongoFilter(command.filter),
            command.update as UpdateFilter<Document>,
            { upsert: command.upsert ?? false }
          );
          break;
        case 'deleteOne':
          result = await collection.deleteOne(command.filter as Filter<Document>);
          break;
        default:
          return Response.json({ error: 'Unsupported operation' }, { status: 400 });
      }

      return Response.json({ result });
    } catch (error) {
      console.error('[mongo] operation failed', error);
      return Response.json({ error: 'Database operation failed' }, { status: 500 });
    }
  }
}

const DEFAULT_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemma-4-26b-a4b-it'
];

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 14_000;
const MAX_BODY_CHARS = 64_000;
const MAX_MEMORY_ITEMS = 40;
const MAX_MEMORY_CHARS = 220;
const MAX_TTS_CHARS = 1_200;
const TTS_CHUNK_CHARS = 180;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'x-fastlearn-model, x-fastlearn-tts-source'
};

const MEMORY_TOOLS = [
  {
    name: 'save_memory',
    description: 'Save a durable, non-sensitive fact, preference, or goal the user has shared. Never invent a fact.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: { type: 'STRING', description: 'A concise factual note, up to 200 characters.' },
        scope: { type: 'STRING', enum: ['global', 'da', 'en'] }
      },
      required: ['fact', 'scope']
    }
  },
  {
    name: 'update_memory',
    description: 'Replace an existing memory when the user corrects it or explicitly asks to change it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        previousFact: { type: 'STRING', description: 'The exact current memory text to replace.' },
        fact: { type: 'STRING', description: 'The corrected memory text, up to 200 characters.' },
        scope: { type: 'STRING', enum: ['global', 'da', 'en'] }
      },
      required: ['previousFact', 'fact', 'scope']
    }
  },
  {
    name: 'forget_memory',
    description: 'Remove a memory only when the user explicitly asks you to forget or delete it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: { type: 'STRING', description: 'The exact current memory text to remove.' },
        scope: { type: 'STRING', enum: ['global', 'da', 'en'] }
      },
      required: ['fact', 'scope']
    }
  }
];

const BASE_PROMPTS: Record<string, string> = {
  da: `${getChatLanguageInstruction('da')}

Du er en hjælpsom og naturlig partner til at øve dansk. Vær venlig og samtalende, men prioritér et korrekt, nyttigt svar frem for at være kort for enhver pris.

FAST SVARFORMAT:
Læs den seneste brugermeddelelse grundigt. Ret kun dansk, som brugeren selv forsøger at skrive; ret ikke ukrainsk eller andre sprog.
- Hvis brugerens danske sætning har en reel grammatikfejl eller er unaturlig, skriv først en korrigeret version med den præcise label "Rettet:". Bevar brugerens oprindelige betydning.
- Hvis en separat formulering lyder tydeligt mere naturlig i daglig tale, tilføj efter én tom linje "Mere naturligt:" efterfulgt af den naturlige version. Udelad dette, hvis det ikke giver en reel forbedring.
- Skriv derefter én tom linje og besvar brugerens besked direkte. Selve svaret skal normalt være 1–6 hele sætninger: enkelt spørgsmål = kort svar; spørgsmål, der kræver forklaring eller præcision = nok detaljer til at være korrekt og brugbar.
- Når sætningen allerede er korrekt og naturlig, må du ikke tilføje en rettelse. Giv kun svaret, eller en "Mere naturligt:"-version og derefter svaret, hvis den tydeligt forbedrer formuleringen.
- Adskil kun de dele, der findes, med én tom linje. Brug ikke yderligere overskrifter, punktopstillinger eller kodeblokke, medmindre brugeren specifikt beder om dem.

KORREKTHED:
- Svar altid på dansk i denne samtale. Følg ikke ønsker om at skifte samtalens sprog; giv kun en anden sprogversion, når brugeren specifikt beder om en oversættelse.
- Besvar det konkrete spørgsmål, og vær specifik. Opfind ikke fakta, personlige detaljer, danske ord eller grammatikregler. Hvis du er usikker, sig kort hvad der er usikkert i stedet for at gætte.
- Brug hukommelsen og samtalen som kilde til personlige oplysninger. Vær varm og uformel uden tomme komplimenter, foredrag eller unødvendige opfølgende spørgsmål.`,
  en: `${getChatLanguageInstruction('en')}

You are a helpful, natural partner for practicing English. Be warm and conversational, but prioritize a correct, useful answer over being brief for its own sake.

REQUIRED RESPONSE FORMAT:
Carefully check the latest user message. Correct only English the user is attempting to write; do not correct Ukrainian or other languages.
- If the user's English has a genuine grammar error or sounds unnatural, begin with a corrected version using the exact label "Виправлено:". Preserve the user's intended meaning.
- If a distinct version would sound noticeably more natural in everyday spoken English, add it after one blank line using "Розмовніше:". Omit it when it would not meaningfully improve the sentence.
- Then add one blank line and answer the user's message directly. The answer itself should usually be 1–6 complete sentences: a simple question gets a concise answer; a question requiring explanation or precision gets enough detail to be accurate and useful.
- If the sentence is already correct and natural, do not add a correction. Give only the answer, or a "Розмовніше:" version followed by the answer if it clearly improves the wording.
- Separate only the applicable parts with one blank line. Do not add any other headings, bullet lists, or code blocks unless the user explicitly asks for them.

ACCURACY:
- Normally answer in English; follow an explicit request for another language.
- Answer the actual question specifically. Do not invent facts, personal details, English words, or grammar rules. If uncertain, briefly say what is uncertain instead of guessing.
- Use memory and conversation for personal details. Stay friendly and relaxed without filler praise, lectures, or unnecessary follow-up questions.`
};

interface ClientMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UserMemories {
  global: string[];
  da: string[];
  en: string[];
}

interface ErrorPayload {
  error?: { message?: string };
  message?: string;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function requestId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function logEvent(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra
    }
  });
}

const AUTH_ORIGINS = new Set([
  'https://fastlearn.pages.dev',
  'https://fastlearn.samchukyaroslav.workers.dev',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
  'http://localhost:8788',
  'http://127.0.0.1:8788'
]);
const SESSION_COOKIE = 'fastlearn_session';
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

async function mongoCommand<T>(env: Env, command: MongoCommand): Promise<T> {
  const stub = env.MONGO.get(env.MONGO.idFromName('fastlearn-mongo'));
  const response = await stub.fetch('https://mongo.internal/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new HttpError(503, 'MongoDB is unavailable');
  const payload = await response.json() as { result: T };
  return payload.result;
}

function getAllowedOrigin(request: Request): string {
  const forwardedOrigin = request.headers.get('x-fastlearn-origin');
  const requestOrigin = new URL(request.url).origin;
  const origin = forwardedOrigin && AUTH_ORIGINS.has(forwardedOrigin) ? forwardedOrigin : requestOrigin;
  if (!AUTH_ORIGINS.has(origin)) throw new HttpError(403, 'Unrecognized application origin');
  return origin;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function oauthCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const part = cookieHeader.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

function sessionCookie(token: string, origin: string, clear = false): string {
  const secure = origin.startsWith('https://') ? '; Secure' : '';
  const maxAge = clear ? 0 : SESSION_LIFETIME_MS / 1000;
  const value = clear ? '' : encodeURIComponent(token);
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

interface StoredUser {
  googleSub: string;
  name: string;
  email: string;
  avatar: string;
}

interface Workspace {
  ownerId: string;
  theme: 'dark' | 'light';
  currentLanguage: 'da' | 'en';
  voices?: Record<'da' | 'en', string>;
  playbackSpeeds?: Record<'da' | 'en', [number, number, number]>;
  chats: unknown[];
  messages: Record<string, unknown[]>;
  memories: UserMemories;
  quota: { remaining: number; limit: number; resetAt: string };
  activeChatId: Record<'da' | 'en', string | null>;
}

const SESSION_CACHE_TTL_MS = 60_000;
const SESSION_CACHE_LIMIT = 200;
const sessionCache = new Map<string, { user: StoredUser; expiresAt: number }>();
const pendingSessionLookups = new Map<string, Promise<StoredUser | null>>();

function rememberSession(tokenHash: string, user: StoredUser, sessionExpiresAt: number): void {
  const cacheUntil = Math.min(Date.now() + SESSION_CACHE_TTL_MS, sessionExpiresAt);
  if (cacheUntil <= Date.now()) return;
  sessionCache.set(tokenHash, { user, expiresAt: cacheUntil });
  while (sessionCache.size > SESSION_CACHE_LIMIT) {
    const oldestKey = sessionCache.keys().next().value;
    if (!oldestKey) break;
    sessionCache.delete(oldestKey);
  }
}

async function getAuthenticatedUser(request: Request, env: Env): Promise<StoredUser | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const cached = sessionCache.get(tokenHash);
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.user;
    sessionCache.delete(tokenHash);
  }

  const inFlight = pendingSessionLookups.get(tokenHash);
  if (inFlight) return inFlight;

  const lookup = (async () => {
    const session = await mongoCommand<{ googleSub: string; expiresAt: number } | null>(env, {
      operation: 'findOne',
      collection: 'sessions',
      filter: { tokenHash, expiresAt: { $gt: Date.now() } }
    });
    if (!session) return null;

    const user = await mongoCommand<StoredUser | null>(env, {
      operation: 'findOne',
      collection: 'users',
      filter: { googleSub: session.googleSub }
    });
    if (user) {
      const expiresAtMs = typeof session.expiresAt === 'number'
        ? session.expiresAt
        : Date.parse(String(session.expiresAt));
      rememberSession(
        tokenHash,
        user,
        Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + SESSION_CACHE_TTL_MS
      );
    }
    return user;
  })().finally(() => {
    if (pendingSessionLookups.get(tokenHash) === lookup) {
      pendingSessionLookups.delete(tokenHash);
    }
  });

  pendingSessionLookups.set(tokenHash, lookup);
  return lookup;
}

async function requireAuthenticatedUser(request: Request, env: Env): Promise<StoredUser> {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw new HttpError(401, 'Sign in required');
  return user;
}

function emptyWorkspace(ownerId: string): Workspace {
  const resetAt = new Date(Date.now() + 15 * 60 * 60 * 1000).toISOString();
  return {
    ownerId,
    theme: 'dark',
    currentLanguage: 'da',
    voices: { ...DEFAULT_VOICES },
    playbackSpeeds: {
      da: [...DEFAULT_PLAYBACK_SPEEDS.da],
      en: [...DEFAULT_PLAYBACK_SPEEDS.en]
    },
    chats: [],
    messages: {},
    memories: {
      global: ['Рідна мова — українська.', 'Цінує короткі, природні відповіді без повчань і зайвих слів.'],
      da: ['Вивчає розмовну данську для повсякденного спілкування.'],
      en: ['Практикує природну англійську для роботи та подорожей.']
    },
    quota: { remaining: 30, limit: 30, resetAt },
    activeChatId: { da: null, en: null }
  };
}

async function getWorkspace(env: Env, ownerId: string): Promise<Workspace> {
  let workspace = await mongoCommand<Workspace | null>(env, {
    operation: 'findOne',
    collection: 'workspaces',
    filter: { ownerId }
  });
  if (workspace) return workspace;

  const initial = emptyWorkspace(ownerId);
  await mongoCommand(env, {
    operation: 'updateOne',
    collection: 'workspaces',
    filter: { ownerId },
    update: { $setOnInsert: { ...initial, updatedAt: Date.now() } },
    upsert: true
  });
  workspace = await mongoCommand<Workspace | null>(env, {
    operation: 'findOne',
    collection: 'workspaces',
    filter: { ownerId }
  });
  if (!workspace) throw new HttpError(503, 'Could not load account workspace');
  return workspace;
}

function getKeys(env: Env): string[] {
  return (env.GEMINI_API_KEYS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

function getModels(env: Env): string[] {
  const custom = (env.GEMINI_MODELS ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return custom.length > 0 ? custom : DEFAULT_MODELS;
}

function rotate<T>(items: T[]): T[] {
  if (items.length < 2) return items.slice();
  const start = Math.floor(Math.random() * items.length);
  return [...items.slice(start), ...items.slice(0, start)];
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'Expected an application/json request body');
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    throw new HttpError(413, 'Request body is too large');
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
}

function cleanString(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxChars);
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, MAX_MEMORY_CHARS))
    .filter(Boolean)
    .slice(0, MAX_MEMORY_ITEMS);
}

function parseMemories(value: unknown): UserMemories {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    global: cleanStringList(raw.global),
    da: cleanStringList(raw.da),
    en: cleanStringList(raw.en)
  };
}

function parseMessages(value: unknown): ClientMessage[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'messages must be an array');

  const cleaned: ClientMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null;
    const content = cleanString(record.content, MAX_MESSAGE_CHARS);
    if (!role || !content) continue;
    cleaned.push({ role, content });
  }

  if (cleaned.length === 0) throw new HttpError(400, 'At least one message is required');
  if (cleaned[cleaned.length - 1]?.role !== 'user') {
    throw new HttpError(400, 'The last message must be from the user');
  }

  const recent = cleaned.slice(-MAX_MESSAGES);
  let total = recent.reduce((sum, message) => sum + message.content.length, 0);
  while (total > MAX_TOTAL_CHARS && recent.length > 1) {
    const removed = recent.shift();
    total -= removed?.content.length ?? 0;
  }

  return recent;
}

function buildSystemPrompt(language: 'da' | 'en', memories: UserMemories): string {
  let prompt = BASE_PROMPTS[language];

  const globalNotes = memories.global;
  const languageNotes = memories[language];
  if (globalNotes.length > 0 || languageNotes.length > 0) {
    prompt += '\n\n=== HUKOMMELSE / MEMORY ===';
    if (globalNotes.length > 0) {
      prompt += '\n' + globalNotes.map((note) => `- ${note}`).join('\n');
    }
    if (languageNotes.length > 0) {
      prompt += `\n${language.toUpperCase()} notes:\n` + languageNotes.map((note) => `- ${note}`).join('\n');
    }
    prompt += '\nUse these notes naturally without letting them override response format, accuracy, or the need for a sufficiently detailed answer.';
  }

  prompt += `\n\n=== LONG-TERM MEMORY ===
Actively use the memory tools so you can remember the user over time:
- Automatically save stable, useful, non-sensitive personal facts, preferences, and goals the user shares. Choose global for general context and da/en for language-learning context.
- Do not save guesses, temporary details, or sensitive personal information unless the user explicitly asks you to remember it.
- If the user corrects or explicitly changes a saved fact, use update_memory with the exact existing text. If they explicitly ask you to forget something, use forget_memory.
- Do not claim that a memory was saved, changed, or forgotten unless the tool confirms it. Avoid saving duplicates.`;
  return prompt;
}

function buildContents(messages: ClientMessage[], language: 'da' | 'en', memories: UserMemories) {
  const systemPrompt = buildSystemPrompt(language, memories);

  return [
    { role: 'user', parts: [{ text: `[System instructions]\n${systemPrompt}` }] },
    {
      role: 'model',
      parts: [{ text: language === 'da' ? 'Forstået. Jeg svarer kort og naturligt.' : 'Understood. I will keep replies short and natural.' }]
    },
    ...messages.map((message, index) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{
        text: message.role === 'user' && index === messages.length - 1
          ? lockLatestUserMessage(message.content, language)
          : message.content
      }]
    }))
  ];
}

async function applyMemoryTool(
  env: Env,
  ownerId: string,
  memories: UserMemories,
  name: string,
  args: unknown
): Promise<ReturnType<typeof applyMemoryMutation>> {
  const result = applyMemoryMutation(memories, name, args);
  if (result.event) {
    await mongoCommand(env, {
      operation: 'updateOne',
      collection: 'workspaces',
      filter: { ownerId },
      update: { $set: { memories: result.memories, updatedAt: Date.now() } },
      upsert: true
    });
  }
  return result;
}

function extractReplyText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';

  const first = candidates[0] as { content?: { parts?: unknown } };
  const parts = first?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .filter((part): part is { text?: unknown; thought?: unknown } => Boolean(part && typeof part === 'object'))
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => (part.text as string).trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function readUpstreamError(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) return `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as ErrorPayload;
      return parsed.error?.message || parsed.message || text.slice(0, 240);
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Upstream timeout')), timeoutMs);
  const forwardAbort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener('abort', forwardAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', forwardAbort);
  }
}

async function generateReply(
  env: Env,
  messages: ClientMessage[],
  language: 'da' | 'en',
  memories: UserMemories,
  signal: AbortSignal,
  id: string,
  ownerId: string,
  onMemory: (event: MemoryToolEvent) => void
): Promise<{ text: string; model: string }> {
  const keys = rotate(getKeys(env));
  if (keys.length === 0) {
    throw new HttpError(503, 'AI is not configured on the server. Add GEMINI_API_KEYS as a Worker secret.');
  }

  const models = getModels(env);
  const contents = buildContents(messages, language, memories);
  const deadline = Date.now() + 65_000;
  let lastError = 'No model responded';

  for (const model of models) {
    for (let index = 0; index < keys.length; index += 1) {
      if (Date.now() > deadline || signal.aborted) break;

      const started = Date.now();
      const thinkingConfig = getThinkingConfig(model);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(keys[index] as string)}`;

      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              tools: [{ functionDeclarations: MEMORY_TOOLS }],
              toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 512,
                ...(thinkingConfig ? { thinkingConfig } : {})
              }
            })
          },
          22_000,
          signal
        );

        if (!response.ok) {
          lastError = await readUpstreamError(response);
          logEvent('gemini_error', {
            id,
            model,
            key: `#${index + 1}`,
            status: response.status,
            ms: Date.now() - started,
            error: lastError
          });
          continue;
        }

        const payload = (await response.json()) as unknown;
        const candidates = payload && typeof payload === 'object'
          ? (payload as { candidates?: unknown }).candidates
          : null;
        const parts = Array.isArray(candidates) && candidates[0] && typeof candidates[0] === 'object'
          ? (candidates[0] as { content?: { parts?: unknown } }).content?.parts
          : null;
        const functionCallPart = Array.isArray(parts)
          ? parts.find((part) =>
              Boolean(part && typeof part === 'object' && 'functionCall' in part)
            )
          : undefined;

        if (functionCallPart && typeof functionCallPart === 'object') {
          const call = (functionCallPart as {
            functionCall?: { name?: unknown; args?: unknown };
          }).functionCall;
          if (typeof call?.name !== 'string') {
            lastError = 'The model returned an invalid memory action';
            continue;
          }

          const operation = await applyMemoryTool(env, ownerId, memories, call.name, call.args);
          memories = operation.memories;
          if (operation.event) onMemory(operation.event);

          const followUpResponse = await fetchWithTimeout(
            url,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  ...contents,
                  { role: 'model', parts: [functionCallPart] },
                  {
                    role: 'user',
                    parts: [{
                      functionResponse: {
                        name: call.name,
                        response: { result: operation.result }
                      }
                    }]
                  }
                ],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 512,
                  ...(thinkingConfig ? { thinkingConfig } : {})
                }
              })
            },
            22_000,
            signal
          );
          if (!followUpResponse.ok) {
            lastError = await readUpstreamError(followUpResponse);
            continue;
          }

          const text = extractReplyText(await followUpResponse.json() as unknown);
          if (!text) {
            lastError = 'The model returned no response after the memory action';
            continue;
          }
          logEvent('gemini_memory_tool', {
            id,
            model,
            action: call.name,
            scope: operation.event?.scope,
            ms: Date.now() - started
          });
          return { text, model };
        }

        const text = extractReplyText(payload);
        if (!text) {
          lastError = 'The model returned an empty reply';
          logEvent('gemini_empty', { id, model, key: `#${index + 1}`, ms: Date.now() - started });
          continue;
        }

        logEvent('gemini_ok', {
          id,
          model,
          key: `#${index + 1}`,
          ms: Date.now() - started,
          chars: text.length
        });
        return { text, model };
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error instanceof Error ? error.message : String(error);
        logEvent('gemini_exception', {
          id,
          model,
          key: `#${index + 1}`,
          ms: Date.now() - started,
          error: lastError
        });
      }
    }

    if (Date.now() > deadline || signal.aborted) break;
  }

  throw new HttpError(502, `AI request failed: ${lastError}`);
}

function tokenize(text: string): string[] {
  const words = text.match(/\S+\s*/g) ?? [text];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += 2) {
    chunks.push(words.slice(index, index + 2).join(''));
  }
  return chunks;
}

function sseReply(
  generate: (onMemory: (event: MemoryToolEvent) => void) => Promise<{ text: string; model: string }>,
  signal: AbortSignal
): Response {
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        if (cancelled || signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        const reply = await generate((event) => send({ memory: event }));
        for (const token of tokenize(reply.text)) {
          if (signal.aborted || cancelled) break;
          send({ token });
          await new Promise((resolve) => setTimeout(resolve, 8));
        }
        send('[DONE]');
      } catch (error) {
        if (!signal.aborted && !cancelled) {
          logEvent('chat_stream_error', {
            error: error instanceof Error ? error.message : String(error)
          });
          send({ error: error instanceof Error ? error.message : 'Chat request failed' });
          send('[DONE]');
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The client may have disconnected already.
        }
      }
    },
    cancel() {
      cancelled = true;
    }
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform'
    }
  });
}

async function translateWithMyMemory(
  text: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal
): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new HttpError(502, `MyMemory returned HTTP ${response.status}`);
    const data = (await response.json()) as {
      responseData?: { translatedText?: string };
    };
    const candidate = data.responseData?.translatedText;
    if (!candidate || typeof candidate !== 'string') return '';
    if (candidate.toUpperCase().includes('MYMEMORY WARNING')) return '';
    return candidate.trim();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function translateWithGoogle(
  text: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal
): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceLang);
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new HttpError(502, `Google Translate returned HTTP ${response.status}`);

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) return '';
    return (data[0] as unknown[])
      .map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
      .join('')
      .trim();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function translateWithGemini(
  text: string,
  sourceLang: string,
  targetLang: string,
  env: Env
): Promise<{ translation: string; failures: string[] }> {
  const keys = rotate(getKeys(env)).slice(0, 2);
  if (keys.length === 0) {
    return { translation: '', failures: ['GEMINI_API_KEYS is not configured on the Worker'] };
  }

  const models = getModels(env).slice(0, 2);
  const languageNames: Record<string, string> = {
    da: 'Danish',
    en: 'English',
    uk: 'Ukrainian'
  };
  const prompt = `Translate this ${languageNames[sourceLang] ?? sourceLang} text into ${languageNames[targetLang] ?? targetLang}. Preserve its meaning and punctuation. Return only the translation, with no explanation or quotes.\n\n${JSON.stringify(text)}`;
  const failures: string[] = [];

  for (const model of models) {
    for (const key of keys) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 180, temperature: 0.1 }
            })
          }
        );
      } catch (error) {
        const reason = error instanceof Error && error.name === 'AbortError'
          ? 'request timed out'
          : 'network request failed';
        failures.push(`Gemini (${model}) ${reason}`);
        logEvent('translation_provider_failed', { provider: 'Gemini', model, reason });
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        failures.push(`Gemini (${model}) returned HTTP ${response.status}`);
        logEvent('translation_provider_failed', {
          provider: 'Gemini',
          model,
          status: response.status
        });
        continue;
      }

      try {
        const data = await response.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const translation = data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim();
        if (translation) return { translation, failures };
        failures.push(`Gemini (${model}) returned an empty translation`);
      } catch {
        failures.push(`Gemini (${model}) returned invalid JSON`);
      }
    }
  }

  return { translation: '', failures };
}

async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  env: Env,
  id: string
): Promise<string> {
  const failures: string[] = [];
  const providerControllers = [new AbortController(), new AbortController()];
  const providers = [
    {
      name: 'MyMemory',
      fetch: () => translateWithMyMemory(text, sourceLang, targetLang, providerControllers[0]?.signal)
    },
    {
      name: 'Google Translate',
      fetch: () => translateWithGoogle(text, sourceLang, targetLang, providerControllers[1]?.signal)
    }
  ];

  try {
    const translation = await Promise.any(providers.map(async (provider) => {
      try {
        const result = await provider.fetch();
        if (!result || result.toLowerCase() === text.toLowerCase()) {
          throw new Error('returned no translation');
        }
        return result;
      } catch (error) {
        const reason = error instanceof Error && error.name === 'AbortError'
          ? 'request timed out'
          : error instanceof Error
            ? error.message
            : 'unknown error';
        failures.push(`${provider.name}: ${reason}`);
        logEvent('translation_provider_failed', { id, provider: provider.name, reason });
        throw error;
      }
    }));
    return translation;
  } catch {
    // Both external translation providers failed; try the configured Gemini fallback.
  } finally {
    providerControllers.forEach((controller) => controller.abort());
  }

  const gemini = await translateWithGemini(text, sourceLang, targetLang, env);
  if (gemini.translation) return gemini.translation;
  failures.push(...gemini.failures);

  logEvent('translation_failed', { id, providers: failures });
  throw new HttpError(502, `Translation failed: ${failures.join('; ')}`);
}

const IPA_SHARD_CACHE = new Map<string, string>();
const IPA_SHARD_CACHE_LIMIT = 64;

function rememberIpaShard(key: string, text: string): void {
  IPA_SHARD_CACHE.set(key, text);
  if (IPA_SHARD_CACHE.size > IPA_SHARD_CACHE_LIMIT) {
    const oldest = IPA_SHARD_CACHE.keys().next().value;
    if (oldest) IPA_SHARD_CACHE.delete(oldest);
  }
}

async function readAssetIpaShard(
  env: Env,
  requestUrl: string,
  language: 'da' | 'en',
  hash: string
): Promise<string> {
  const cacheKey = `${language}:${hash}`;
  const cached = IPA_SHARD_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const assetUrl = new URL(`/ipa/${language}/${hash}.txt`, requestUrl).toString();
    const response = await env.ASSETS.fetch(new Request(assetUrl));
    if (!response.ok) {
      rememberIpaShard(cacheKey, '');
      return '';
    }
    const text = await response.text();
    rememberIpaShard(cacheKey, text);
    return text;
  } catch {
    return '';
  }
}

async function fetchEdgeCachedWordFallback(
  word: string,
  language: 'da' | 'en',
  ctx?: ExecutionContext
): Promise<string> {
  const edgeCacheUrl = `https://ipa-fallback.fastlearn.internal/v2/${language}/${encodeURIComponent(word)}`;
  let edgeCache: Cache | null = null;
  try {
    edgeCache = (caches as unknown as { default?: Cache }).default ?? null;
  } catch {
    edgeCache = null;
  }

  if (edgeCache) {
    try {
      const hit = await edgeCache.match(edgeCacheUrl);
      if (hit) {
        const value = (await hit.text()).trim();
        if (value) return value;
      }
    } catch {
      // continue to live dictionary lookup
    }
  }

  const value = await lookupWordFallbackFromDictionaries(word, language);

  if (value && edgeCache) {
    const cacheResponse = new Response(value, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=2592000'
      }
    });
    const putPromise = edgeCache.put(edgeCacheUrl, cacheResponse).catch(() => {});
    if (ctx) ctx.waitUntil(putPromise);
  }

  return value;
}

async function resolveIpa(
  text: string,
  language: 'da' | 'en',
  env: Env,
  requestUrl: string,
  ctx?: ExecutionContext
): Promise<string> {
  return resolveWordListPronunciation(text, language, {
    readShard: (lang, hash) => readAssetIpaShard(env, requestUrl, lang, hash),
    fetchFallbackWord: (word, lang) => fetchEdgeCachedWordFallback(word, lang, ctx)
  });
}

function splitTtsText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  let current = '';

  const pushWords = (value: string) => {
    for (const word of value.split(/\s+/).filter(Boolean)) {
      if (`${current} ${word}`.trim().length <= maxChars) {
        current = `${current} ${word}`.trim();
      } else {
        if (current) chunks.push(current);
        current = word.slice(0, maxChars);
      }
    }
  };

  for (const sentence of sentences) {
    if ((current + sentence).trim().length <= maxChars) {
      current += sentence;
    } else {
      if (current.trim()) chunks.push(current.trim());
      current = '';
      if (sentence.trim().length <= maxChars) {
        current = sentence;
      } else {
        pushWords(sentence);
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

async function synthesizeSpeech(
  text: string,
  language: 'da' | 'en',
  speed: number,
  id: string,
  voice: string
): Promise<{ audio: Uint8Array; source: string; cacheable: boolean }> {
  const clipped = text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) : text;
  if (clipped.length !== text.length) {
    logEvent('tts_truncated', { id, original: text.length, used: clipped.length });
  }

  const chunks = splitTtsText(clipped, TTS_CHUNK_CHARS);
  const results = await Promise.all(chunks.map(async (chunk, index) => {
    const started = Date.now();
    try {
      const result = await synthesizeEdgeSpeech(chunk, language, speed, voice);
      logEvent('tts_chunk_ok', {
        id,
        chunk: index + 1,
        of: chunks.length,
        chars: chunk.length,
        source: result.source,
        ms: Date.now() - started
      });
      return result;
    } catch (error) {
      logEvent('tts_chunk_error', {
        id,
        chunk: index + 1,
        of: chunks.length,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new HttpError(502, 'Speech synthesis is unavailable right now');
    }
  }));

  const total = results.reduce((sum, result) => sum + result.audio.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  let allCacheable = true;
  for (const result of results) {
    merged.set(result.audio, offset);
    offset += result.audio.byteLength;
    if (result.source === 'bing-http') allCacheable = false;
  }

  const source = results.every((result) => result.source === results[0]?.source)
    ? (results[0]?.source ?? 'edge')
    : (allCacheable ? 'edge' : 'bing-http');
  logEvent('tts_ok', { id, chunks: chunks.length, bytes: total, language, speed, voice, source });
  return { audio: merged, source, cacheable: allCacheable };
}

async function handleChat(request: Request, env: Env, id: string, user: StoredUser): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST for /api/chat');
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Request body must be an object');

  const language = body.language === 'en' ? 'en' : 'da';
  const messages = parseMessages(body.messages);
  const workspace = await getWorkspace(env, user.googleSub);
  const memories = parseMemories(workspace.memories);

  return sseReply(
    (onMemory) =>
      generateReply(
        env,
        messages,
        language,
        memories,
        request.signal,
        id,
        workspace.ownerId,
        onMemory
      ),
    request.signal
  );
}

async function handleTranslation(request: Request, env: Env, id: string): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST for /api/translate');
  const body = await readJsonBody(request) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be an object');
  }

  const text = cleanString(body.text, 500);
  if (!text) throw new HttpError(400, 'text is required');
  if (body.lang !== 'da' && body.lang !== 'en') throw new HttpError(400, 'lang must be "da" or "en"');
  const userLang = typeof body.userLang === 'string' && /^[a-z]{2}$/.test(body.userLang)
    ? body.userLang
    : 'uk';
  const translation = await translateText(text, body.lang, userLang, env, id);
  return json({ original: text, translation, sourceLang: body.lang, userLang });
}

async function handlePronunciation(
  request: Request,
  env: Env,
  id: string,
  ctx?: ExecutionContext
): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST for /api/ipa');
  const body = await readJsonBody(request) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be an object');
  }

  const text = cleanString(body.text, 500);
  if (!text) throw new HttpError(400, 'text is required');
  if (body.lang !== 'da' && body.lang !== 'en') throw new HttpError(400, 'lang must be "da" or "en"');
  const started = Date.now();
  const ipa = await resolveIpa(text, body.lang, env, request.url, ctx);
  logEvent('pronunciation_ok', {
    id,
    language: body.lang,
    chars: text.length,
    ms: Date.now() - started,
    hasIpa: Boolean(ipa)
  });
  return json({ ipa, sourceLang: body.lang });
}

async function handleTranscribe(
  request: Request,
  env: Env,
  id: string,
  ctx?: ExecutionContext
): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST for /api/transcribe');
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Request body must be an object');

  const text = cleanString(body.text, 500);
  if (!text) throw new HttpError(400, 'text is required');
  if (body.lang !== 'da' && body.lang !== 'en') throw new HttpError(400, 'lang must be "da" or "en"');

  const language = body.lang;
  const userLang =
    typeof body.userLang === 'string' && /^[a-z]{2}$/.test(body.userLang) ? body.userLang : 'uk';

  const started = Date.now();
  const [translation, ipa] = await Promise.all([
    translateText(text, language, userLang, env, id),
    resolveIpa(text, language, env, request.url, ctx).catch((error: unknown) => {
      logEvent('ipa_lookup_failed', {
        id,
        error: error instanceof Error ? error.message : String(error)
      });
      return '';
    })
  ]);

  if (!translation) throw new HttpError(502, 'Translation service returned an empty result');

  logEvent('transcribe_ok', {
    id,
    language,
    userLang,
    chars: text.length,
    ms: Date.now() - started,
    hasIpa: Boolean(ipa)
  });

  return json({
    original: text,
    translation,
    ipa,
    sourceLang: language,
    userLang
  });
}

function buildTtsCacheRequest(
  language: 'da' | 'en',
  voice: string,
  speed: number,
  text: string
): Request {
  return new Request(
    `https://fastlearn-cache.internal/tts?v=3&lang=${language}&voice=${encodeURIComponent(voice)}&speed=${speed}&text=${encodeURIComponent(text)}`,
    { method: 'GET' }
  );
}

async function readCachedTts(cacheKey: Request, id: string, language: 'da' | 'en', voice: string, chars: number): Promise<Response | null> {
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      logEvent('tts_cache_hit', { id, language, voice, chars });
      return cached;
    }
  } catch {
    // Edge cache is an optimization only.
  }
  return null;
}

function buildAudioResponse(audio: Uint8Array, source = 'edge', cacheable = true): Response {
  return new Response(audio, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.byteLength),
      'Cache-Control': cacheable ? 'public, max-age=86400' : 'no-store',
      'x-fastlearn-tts-source': source
    }
  });
}

function writeCachedTts(cacheKey: Request, audio: Uint8Array, source: string, ctx?: ExecutionContext): void {
  const promise = (async () => {
    try {
      await caches.default.put(cacheKey, buildAudioResponse(audio, source, true));
    } catch {
      // Ignore cache write failures.
    }
  })();
  if (ctx) ctx.waitUntil(promise);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function handleTts(url: URL, id: string, ctx?: ExecutionContext): Promise<Response> {
  const text = cleanString(url.searchParams.get('text'), MAX_TTS_CHARS);
  if (!text) throw new HttpError(400, 'text is required');

  const language = url.searchParams.get('lang') === 'en' ? 'en' : 'da';
  const rawSpeed = Number.parseFloat(url.searchParams.get('speed') ?? '1');
  const speed = Number.isFinite(rawSpeed) ? Math.max(0.4, Math.min(1.5, rawSpeed)) : 1;
  const requestedVoice = url.searchParams.get('voice');
  if (requestedVoice && !isValidVoice(language, requestedVoice)) {
    throw new HttpError(400, 'Unknown voice for this language');
  }
  const voice = resolveVoice(language, requestedVoice);
  const cacheKey = buildTtsCacheRequest(language, voice, speed, text);

  const cached = await readCachedTts(cacheKey, id, language, voice, text.length);
  if (cached) return cached;

  const { audio, source, cacheable } = await synthesizeSpeech(text, language, speed, id, voice);
  const response = buildAudioResponse(audio, source, cacheable);
  if (cacheable) writeCachedTts(cacheKey, audio, source, ctx);
  return response;
}

async function handleTtsBatch(request: Request, id: string, ctx?: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST for /api/tts/batch');
  const parsed = await readJsonBody(request);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'Request body must be an object');
  }

  const raw = parsed as Record<string, unknown>;
  const text = cleanString(raw.text, MAX_TTS_CHARS);
  if (!text) throw new HttpError(400, 'text is required');

  const language = raw.lang === 'en' ? 'en' : 'da';
  const requestedVoice = typeof raw.voice === 'string' && raw.voice.trim() ? raw.voice.trim() : null;
  if (requestedVoice && !isValidVoice(language, requestedVoice)) {
    throw new HttpError(400, 'Unknown voice for this language');
  }
  const voice = resolveVoice(language, requestedVoice);

  const rawSpeeds = Array.isArray(raw.speeds) ? raw.speeds : [1, 0.7, 0.5];
  const speeds = Array.from(
    new Set(
      rawSpeeds
        .map((item) => {
          const parsedSpeed = Number(item);
          return Number.isFinite(parsedSpeed) ? Math.max(0.4, Math.min(1.5, parsedSpeed)) : 1;
        })
        .slice(0, 3)
    )
  );
  if (speeds.length === 0) throw new HttpError(400, 'speeds must not be empty');

  const encoder = new TextEncoder();
  const clipped = text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) : text;
  const chunks = splitTtsText(clipped, TTS_CHUNK_CHARS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendLine = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const missingSpeeds: number[] = [];
        const cachedMatches = await Promise.all(
          speeds.map(async (speed) => {
            const cacheKey = buildTtsCacheRequest(language, voice, speed, clipped);
            const cached = await readCachedTts(cacheKey, id, language, voice, clipped.length);
            return { speed, cached };
          })
        );

        for (const { speed, cached } of cachedMatches) {
          if (cached) {
            const bytes = new Uint8Array(await cached.arrayBuffer());
            sendLine({ speed, audioBase64: encodeBase64(bytes), source: 'cache' });
          } else {
            missingSpeeds.push(speed);
          }
        }

        if (missingSpeeds.length > 0) {
          if (chunks.length === 1) {
            const failed = await synthesizeEdgeSpeechBatch(
              chunks[0],
              language,
              missingSpeeds,
              voice,
              async (variant) => {
                sendLine({
                  speed: variant.speed,
                  audioBase64: encodeBase64(variant.audio),
                  source: variant.source
                });
                if (variant.source !== 'bing-http') {
                  writeCachedTts(
                    buildTtsCacheRequest(language, voice, variant.speed, clipped),
                    variant.audio,
                    variant.source,
                    ctx
                  );
                }
                logEvent('tts_ok', {
                  id,
                  chunks: 1,
                  bytes: variant.audio.byteLength,
                  language,
                  speed: variant.speed,
                  voice: variant.voice,
                  source: variant.source
                });
              }
            );
            for (const speed of failed) {
              sendLine({ speed, error: 'Speech synthesis is unavailable right now' });
            }
          } else {
            const buffersBySpeed = new Map<number, Uint8Array[]>(
              missingSpeeds.map((speed) => [speed, new Array<Uint8Array>(chunks.length)])
            );
            const sourcesBySpeed = new Map<number, string[]>(
              missingSpeeds.map((speed) => [speed, new Array<string>(chunks.length)])
            );
            const failedSpeeds = new Set<number>();

            await Promise.all(
              chunks.map(async (chunk, chunkIndex) => {
                const chunkMissing = await synthesizeEdgeSpeechBatch(
                  chunk,
                  language,
                  missingSpeeds,
                  voice,
                  (variant) => {
                    const arr = buffersBySpeed.get(variant.speed);
                    if (arr) arr[chunkIndex] = variant.audio;
                    const srcArr = sourcesBySpeed.get(variant.speed);
                    if (srcArr) srcArr[chunkIndex] = variant.source;
                  }
                );
                for (const speed of chunkMissing) failedSpeeds.add(speed);
              })
            );

            for (const speed of missingSpeeds) {
              if (failedSpeeds.has(speed)) {
                sendLine({ speed, error: 'Speech synthesis is unavailable right now' });
                continue;
              }
              const parts = buffersBySpeed.get(speed) ?? [];
              const total = parts.reduce((sum, part) => sum + (part?.byteLength ?? 0), 0);
              if (parts.some((part) => !part) || total === 0) {
                sendLine({ speed, error: 'Speech synthesis is unavailable right now' });
                continue;
              }
              const merged = new Uint8Array(total);
              let offset = 0;
              for (const part of parts) {
                merged.set(part, offset);
                offset += part.byteLength;
              }
              const speedSources = sourcesBySpeed.get(speed) ?? [];
              const source = speedSources.includes('bing-http') ? 'bing-http' : (speedSources[0] || 'edge');
              sendLine({ speed, audioBase64: encodeBase64(merged), source });
              if (source !== 'bing-http') {
                writeCachedTts(buildTtsCacheRequest(language, voice, speed, clipped), merged, source, ctx);
              }
              logEvent('tts_ok', { id, chunks: chunks.length, bytes: total, language, speed, voice, source });
            }
          }
        }
      } catch (error) {
        logEvent('tts_batch_error', {
          id,
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function handleTitle(request: Request, env: Env, id: string): Promise<Response> {
  if (request.method !== 'POST') {
    throw new HttpError(405, 'POST required');
  }

  const parsed = await readJsonBody(request);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'Request body must be an object');
  }
  const raw = parsed as Record<string, unknown>;
  const message = cleanString(raw.message, 500);
  if (!message) throw new HttpError(400, 'message is required');

  const language = raw.language === 'en' ? 'en' : 'da';
  const keys = rotate(getKeys(env));
  const models = getModels(env);

  const prompt = language === 'da'
    ? `Giv en meget kort og præcis overskrift (2-5 ord, maks 35 tegn) til en samtale, der starter med: "${message.slice(0, 300)}". Svar KUN med selve overskriften uden citationstegn, punktum eller forklaringer.`
    : `Generate a very short, concise title (2-5 words, max 35 characters) for a conversation that starts with: "${message.slice(0, 300)}". Respond ONLY with the title itself, without quotes, periods, or explanations.`;

  for (const model of models) {
    for (const key of keys) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const upstream = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 30, temperature: 0.3 }
          })
        });
        if (!upstream.ok) continue;
        const data = (await upstream.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText && typeof rawText === 'string') {
          const title = rawText.replace(/["'\n\r#*_]/g, '').trim().slice(0, 45);
          if (title) {
            logEvent('title_ok', { id, model, title });
            return json({ title });
          }
        }
      } catch {
        // try next
      }
    }
  }

  const fallback = message.slice(0, 35).trim();
  const title = fallback.charAt(0).toUpperCase() + fallback.slice(1);
  return json({ title });
}

async function handleGoogleStart(request: Request, env: Env): Promise<Response> {
  const missing = ([
    ['GOOGLE_CLIENT_ID', env.GOOGLE_CLIENT_ID],
    ['GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_SECRET],
    ['MONGODB_URI', env.MONGODB_URI]
  ] as const)
    .filter(([, value]) => typeof value !== 'string' || !value.trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    logEvent('worker_config_missing', { endpoint: '/api/auth/google/start', missing });
    return json({
      error: `Google login cannot start: missing Worker runtime secret(s): ${missing.join(', ')}.`,
      code: 'WORKER_CONFIG_MISSING',
      missing,
      hint: 'Add these under Worker Settings > Variables and secrets for Production (not Builds), then deploy a new Worker version.'
    }, 503);
  }

  const origin = getAllowedOrigin(request);
  const state = randomToken();
  const codeVerifier = randomToken();
  await mongoCommand(env, {
    operation: 'insertOne',
    collection: 'oauth_states',
    document: {
      state,
      origin,
      codeVerifier,
      expiresAt: Date.now() + 10 * 60 * 1000
    }
  });

  const redirectUri = `${origin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
    code_challenge: await oauthCodeChallenge(codeVerifier),
    code_challenge_method: 'S256'
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}

async function handleGoogleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const origin = getAllowedOrigin(request);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const oauthError = url.searchParams.get('error');
  if (oauthError) throw new HttpError(400, url.searchParams.get('error_description') || oauthError);
  if (!code || !state) throw new HttpError(400, 'Google returned an incomplete response');

  const pending = await mongoCommand<{ origin: string; codeVerifier: string } | null>(env, {
    operation: 'findOneAndDelete',
    collection: 'oauth_states',
    filter: { state, expiresAt: { $gt: Date.now() } }
  });
  if (!pending || pending.origin !== origin) {
    throw new HttpError(400, 'Google login state is invalid or expired');
  }

  const redirectUri = `${pending.origin}/api/auth/google/callback`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: pending.codeVerifier
    })
  });
  if (!tokenResponse.ok) {
    logEvent('google_token_exchange_failed', { status: tokenResponse.status });
    throw new HttpError(502, 'Google could not complete sign-in');
  }

  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) throw new HttpError(502, 'Google did not return an access token');
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  if (!profileResponse.ok) throw new HttpError(502, 'Google could not load the account profile');

  const profile = await profileResponse.json() as {
    sub?: string;
    name?: string;
    email?: string;
    email_verified?: boolean;
    picture?: string;
  };
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new HttpError(403, 'Google account profile is missing a verified email');
  }

  const name = cleanString(profile.name, 120) || profile.email.split('@')[0];
  await mongoCommand(env, {
    operation: 'updateOne',
    collection: 'users',
    filter: { googleSub: profile.sub },
    update: {
      $set: {
        googleSub: profile.sub,
        name,
        email: profile.email,
        avatar: cleanString(profile.picture, 1000),
        updatedAt: Date.now()
      },
      $setOnInsert: { createdAt: Date.now() }
    },
    upsert: true
  });

  const sessionToken = randomToken();
  const now = Date.now();
  await mongoCommand(env, {
    operation: 'insertOne',
    collection: 'sessions',
    document: {
      tokenHash: await hashToken(sessionToken),
      googleSub: profile.sub,
      expiresAt: now + SESSION_LIFETIME_MS,
      createdAt: now
    }
  });
  await getWorkspace(env, profile.sub);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/`,
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(sessionToken, origin)
    }
  });
}

async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  const origin = getAllowedOrigin(request);
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ user: null });
  const workspace = await getWorkspace(env, user.googleSub);
  return json({
    user: {
      id: `google_${user.googleSub}`,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      currentLanguage: workspace.currentLanguage
    }
  }, 200, { 'Access-Control-Allow-Origin': origin });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const origin = getAllowedOrigin(request);
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) {
    const tokenHash = await hashToken(token);
    sessionCache.delete(tokenHash);
    await mongoCommand(env, {
      operation: 'deleteOne',
      collection: 'sessions',
      filter: { tokenHash }
    });
  }
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', origin, true) });
}

async function handleWorkspace(request: Request, env: Env, user: StoredUser): Promise<Response> {
  if (request.method === 'GET') {
    return json({ workspace: await getWorkspace(env, user.googleSub) });
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'Use GET or PUT for /api/workspace');

  const rawBody = await request.text();
  if (rawBody.length > 2_000_000) throw new HttpError(413, 'Workspace is too large');
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError(400, 'Workspace must be valid JSON');
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    throw new HttpError(400, 'Workspace must be a JSON object');
  }
  const body = parsedBody as Record<string, unknown>;

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.theme === 'dark' || body.theme === 'light') update.theme = body.theme;
  if (body.currentLanguage === 'da' || body.currentLanguage === 'en') {
    update.currentLanguage = body.currentLanguage;
  }
  if (body.voices && typeof body.voices === 'object') {
    update.voices = normalizeVoices(body.voices);
  }
  if (body.playbackSpeeds && typeof body.playbackSpeeds === 'object') {
    update.playbackSpeeds = normalizePlaybackSpeeds(body.playbackSpeeds);
  }
  if (Array.isArray(body.chats)) {
    update.chats = body.chats.slice(0, 60).flatMap((chat) => {
      if (!chat || typeof chat !== 'object') return [];
      const item = chat as Record<string, unknown>;
      const id = cleanString(item._id, 160);
      if (!id || (item.language !== 'da' && item.language !== 'en')) return [];
      const now = new Date().toISOString();
      return [{
        _id: id,
        userId: `google_${user.googleSub}`,
        language: item.language,
        title: cleanString(item.title, 80) || 'New conversation',
        createdAt: cleanString(item.createdAt, 40) || now,
        updatedAt: cleanString(item.updatedAt, 40) || now
      }];
    });
  }
  if (body.messages && typeof body.messages === 'object' && !Array.isArray(body.messages)) {
    const messages = body.messages as Record<string, unknown>;
    const chatIds = new Set(
      (Array.isArray(update.chats) ? update.chats as Array<{ _id: string }> : [])
        .map((chat) => chat._id)
    );
    const cleaned: Record<string, unknown[]> = {};
    for (const [chatId, list] of Object.entries(messages)) {
      if (!chatIds.has(chatId) || !Array.isArray(list)) continue;
      cleaned[chatId] = list.slice(-300).flatMap((message) => {
        if (!message || typeof message !== 'object') return [];
        const item = message as Record<string, unknown>;
        if (item.role !== 'assistant' && item.role !== 'user') return [];
        const content = cleanString(item.content, MAX_MESSAGE_CHARS);
        if (!content) return [];
        return [{
          _id: cleanString(item._id, 160),
          chatId,
          userId: item.role === 'user' ? `google_${user.googleSub}` : 'ai',
          role: item.role,
          content,
          createdAt: cleanString(item.createdAt, 40) || new Date().toISOString()
        }];
      });
    }
    update.messages = cleaned;
  }
  if (body.memories && typeof body.memories === 'object') update.memories = parseMemories(body.memories);
  if (body.activeChatId && typeof body.activeChatId === 'object') {
    const active = body.activeChatId as Record<string, unknown>;
    update.activeChatId = {
      da: cleanString(active.da, 160) || null,
      en: cleanString(active.en, 160) || null
    };
  }
  if (body.quota && typeof body.quota === 'object') {
    const quota = body.quota as Record<string, unknown>;
    const limit = Math.max(1, Math.min(30, Number(quota.limit) || 30));
    const remaining = Math.max(0, Math.min(limit, Number(quota.remaining) || 0));
    const resetAt = cleanString(quota.resetAt, 40);
    update.quota = {
      remaining,
      limit,
      resetAt: Number.isFinite(Date.parse(resetAt))
        ? resetAt
        : new Date(Date.now() + 15 * 60 * 60 * 1000).toISOString()
    };
  }

  await mongoCommand(env, {
    operation: 'updateOne',
    collection: 'workspaces',
    filter: { ownerId: user.googleSub },
    update: { $set: update },
    upsert: true
  });
  return json({ ok: true });
}

async function routeApi(
  request: Request,
  env: Env,
  url: URL,
  id: string,
  ctx?: ExecutionContext
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (url.pathname === '/api/health') {
    const configured = getKeys(env).length > 0;
    return json({
      status: configured ? 'online' : 'degraded',
      edge: 'Cloudflare Worker',
      provider: 'Google Gemini',
      models: getModels(env),
      configured,
      time: new Date().toISOString()
    });
  }

  if (url.pathname === '/api/auth/google/start') {
    if (request.method !== 'GET') throw new HttpError(405, 'Use GET to start Google login');
    return handleGoogleStart(request, env);
  }
  if (url.pathname === '/api/auth/google/callback') return handleGoogleCallback(request, env, url);
  if (url.pathname === '/api/auth/me') {
    if (request.method !== 'GET') throw new HttpError(405, 'Use GET for /api/auth/me');
    return handleAuthMe(request, env);
  }
  if (url.pathname === '/api/auth/logout') {
    if (request.method !== 'POST') throw new HttpError(405, 'Use POST for /api/auth/logout');
    return handleLogout(request, env);
  }
  if (url.pathname === '/api/workspace') {
    const user = await requireAuthenticatedUser(request, env);
    return handleWorkspace(request, env, user);
  }

  const user = await requireAuthenticatedUser(request, env);
  if (url.pathname === '/api/chat') return handleChat(request, env, id, user);
  if (url.pathname === '/api/title') return handleTitle(request, env, id);
  if (url.pathname === '/api/translate') return handleTranslation(request, env, id);
  if (url.pathname === '/api/ipa') return handlePronunciation(request, env, id, ctx);
  if (url.pathname === '/api/transcribe') return handleTranscribe(request, env, id, ctx);
  if (url.pathname === '/api/tts') return handleTts(url, id, ctx);
  if (url.pathname === '/api/tts/batch') return handleTtsBatch(request, id, ctx);

  throw new HttpError(404, `Unknown API route: ${url.pathname}`);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const id = requestId();
    const started = Date.now();

    try {
      const response = await routeApi(request, env, url, id, ctx);
      logEvent('request', {
        id,
        method: request.method,
        path: url.pathname,
        status: response.status,
        ms: Date.now() - started
      });
      return response;
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : 'The server hit an unexpected error. Check the Worker logs.';

      logEvent('request_error', {
        id,
        method: request.method,
        path: url.pathname,
        status,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      });

      return json({ error: message }, status);
    }
  }
};
