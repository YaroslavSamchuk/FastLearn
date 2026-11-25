import { DEFAULT_VOICES } from '../../server/ttsConfig.js';
import { log } from './logger.ts';

export const TRANSLATION_CACHE_LIMIT_BYTES = 500 * 1024 * 1024;

export type HistoryEntryKind = 'selection' | 'message';

export interface TranslationHistoryEntry {
  key: string;
  userId: string;
  language: 'da' | 'en';
  text: string;
  kind?: HistoryEntryKind;
  translation?: string;
  ipa?: string;
  ipaVersion?: number;
  audioVoice?: string;
  normalAudio?: Blob;
  slowAudio07?: Blob;
  slowAudio05?: Blob;
  audioBySpeed?: Record<string, Blob>;
  sizeBytes: number;
  lastUsedAt: number;
}

type TranslationHistoryUpdate = Partial<
  Pick<
    TranslationHistoryEntry,
    | 'kind'
    | 'translation'
    | 'ipa'
    | 'ipaVersion'
    | 'audioVoice'
    | 'normalAudio'
    | 'slowAudio07'
    | 'slowAudio05'
    | 'audioBySpeed'
  >
>;

export interface HistoryStorageStats {
  totalBytes: number;
  selectionBytes: number;
  selectionCount: number;
  limitBytes: number;
}

function formatSpeedKey(speed: number): string {
  const numeric = Number.isFinite(speed) ? Math.max(0.4, Math.min(1.5, speed)) : 1;
  return String(Number(numeric.toFixed(2)));
}

const DATABASE_NAME = 'fastlearn_translation_history';
const STORE_NAME = 'entries';
const DATABASE_VERSION = 6;
const INDEXEDDB_TIMEOUT_MS = 1_500;
let databasePromise: Promise<IDBDatabase> | null = null;

export function makeTranslationHistoryKey(
  userId: string,
  language: 'da' | 'en',
  text: string
): string {
  return `${userId}:${language}:${text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`;
}

export function isSelectionHistoryEntry(entry: TranslationHistoryEntry): boolean {
  if (entry.kind === 'selection') return true;
  if (entry.kind === 'message') return false;
  return Boolean(entry.translation || entry.ipa);
}

export function listSortedSelectionEntries(
  entries: readonly TranslationHistoryEntry[],
  userId: string,
  language?: 'da' | 'en'
): TranslationHistoryEntry[] {
  return entries
    .filter((entry) => {
      if (entry.userId !== userId) return false;
      if (language && entry.language !== language) return false;
      return isSelectionHistoryEntry(entry);
    })
    .slice()
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt);
}

export function planHistoryEviction(
  entries: readonly TranslationHistoryEntry[],
  nextEntry: TranslationHistoryEntry,
  limitBytes = TRANSLATION_CACHE_LIMIT_BYTES
): {
  oversized: boolean;
  evictKeys: string[];
  totalBytesAfter: number;
} {
  const existing = entries.find((entry) => entry.key === nextEntry.key);
  if (nextEntry.sizeBytes > limitBytes) {
    const remainingTotal = entries.reduce(
      (sum, entry) => (entry.key === nextEntry.key ? sum : sum + entry.sizeBytes),
      0
    );
    return {
      oversized: true,
      evictKeys: existing ? [nextEntry.key] : [],
      totalBytesAfter: remainingTotal
    };
  }

  let totalBytes =
    entries.reduce((sum, entry) => sum + entry.sizeBytes, 0) -
    (existing?.sizeBytes ?? 0) +
    nextEntry.sizeBytes;

  const oldestFirst = entries
    .filter((entry) => entry.key !== nextEntry.key)
    .slice()
    .sort((left, right) => left.lastUsedAt - right.lastUsedAt);

  const evictKeys: string[] = [];
  for (const entry of oldestFirst) {
    if (totalBytes <= limitBytes) break;
    evictKeys.push(entry.key);
    totalBytes -= entry.sizeBytes;
  }

  return {
    oversized: false,
    evictKeys,
    totalBytesAfter: Math.max(0, totalBytes)
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser'));
  }

  if (databasePromise) return databasePromise;

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      if (databasePromise === pending) databasePromise = null;
      reject(new Error('Timed out opening translation history database'));
    }, INDEXEDDB_TIMEOUT_MS);

    const finishResolve = (database: IDBDatabase) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(database);
    };

    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (databasePromise === pending) databasePromise = null;
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('lastUsedAt', 'lastUsedAt');
      } else if (event.oldVersion < 3) {
        const store = request.transaction?.objectStore(STORE_NAME);
        if (!store) {
          finishReject(new Error('Could not access translation history during its upgrade'));
          return;
        }

        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;

          const entry = cursor.value as TranslationHistoryEntry & {
            slowAudio?: Blob;
            slowAudio06?: Blob;
          };
          delete entry.slowAudio;
          delete entry.slowAudio06;
          delete entry.normalAudio;
          delete entry.slowAudio07;
          delete entry.slowAudio05;
          entry.sizeBytes = entrySize(entry);
          cursor.update(entry);
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onclose = () => {
        if (databasePromise === pending) databasePromise = null;
      };
      database.onversionchange = () => {
        database.close();
        if (databasePromise === pending) databasePromise = null;
      };
      finishResolve(database);
    };
    request.onerror = () => {
      finishReject(request.error ?? new Error('Could not open translation history'));
    };
    request.onblocked = () => {
      finishReject(new Error('Translation history database upgrade is blocked'));
    };
  });

  databasePromise = pending;
  return pending;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Translation history read timed out'));
    }, INDEXEDDB_TIMEOUT_MS);

    request.onsuccess = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(request.error ?? new Error('Translation history request failed'));
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Translation history transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Translation history transaction was aborted'));
  });
}

export function entrySize(entry: Omit<TranslationHistoryEntry, 'sizeBytes'>): number {
  const textBytes = new TextEncoder().encode(
    `${entry.userId}\u0000${entry.language}\u0000${entry.text}\u0000${entry.translation ?? ''}\u0000${entry.ipa ?? ''}`
  ).byteLength;
  const dynamicBytes = Object.values(entry.audioBySpeed ?? {}).reduce(
    (sum, blob) => sum + (blob?.size ?? 0),
    0
  );
  return textBytes +
    (entry.normalAudio?.size ?? 0) +
    (entry.slowAudio07?.size ?? 0) +
    (entry.slowAudio05?.size ?? 0) +
    dynamicBytes;
}

export async function touchTranslationHistoryEntry(
  userId: string,
  language: 'da' | 'en',
  text: string
): Promise<void> {
  if (!userId || !text.trim()) return;

  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STORE_NAME);
  const key = makeTranslationHistoryKey(userId, language, text);
  const existing = (await requestResult(store.get(key))) as TranslationHistoryEntry | undefined;
  if (existing) {
    store.put({
      ...existing,
      lastUsedAt: Date.now()
    });
  }
  await done;
}

export async function getTranslationHistoryEntry(
  userId: string,
  language: 'da' | 'en',
  text: string,
  options?: { touch?: boolean }
): Promise<TranslationHistoryEntry | null> {
  if (!userId || !text.trim()) return null;

  const database = await openDatabase();
  const mode = options?.touch ? 'readwrite' : 'readonly';
  const transaction = database.transaction(STORE_NAME, mode);
  const store = transaction.objectStore(STORE_NAME);
  const key = makeTranslationHistoryKey(userId, language, text);
  const entry = (await requestResult(store.get(key))) as TranslationHistoryEntry | undefined;

  if (entry && options?.touch) {
    const promoted: TranslationHistoryEntry = {
      ...entry,
      lastUsedAt: Date.now()
    };
    store.put(promoted);
    await transactionDone(transaction);
    return promoted;
  }

  return entry ?? null;
}

export async function updateTranslationHistoryEntry(
  userId: string,
  language: 'da' | 'en',
  text: string,
  update: TranslationHistoryUpdate
): Promise<void> {
  if (!userId || !text.trim()) return;

  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STORE_NAME);
  const key = makeTranslationHistoryKey(userId, language, text);
  const existing = (await requestResult(store.get(key))) as TranslationHistoryEntry | undefined;
  const existingVoice = existing?.audioVoice ?? DEFAULT_VOICES[language];
  const voiceChanged = Boolean(update.audioVoice && existing && existingVoice !== update.audioVoice);
  const nextKind: HistoryEntryKind | undefined =
    update.kind ??
    existing?.kind ??
    (update.translation !== undefined || update.ipa !== undefined ? 'selection' : undefined);

  const nextBase = {
    key,
    userId,
    language,
    text: text.trim().replace(/\s+/g, ' '),
    ...(nextKind ? { kind: nextKind } : {}),
    translation: update.translation ?? existing?.translation,
    ipa: update.ipa ?? existing?.ipa,
    ipaVersion: update.ipaVersion ?? existing?.ipaVersion,
    audioVoice: update.audioVoice ?? existing?.audioVoice,
    normalAudio: update.normalAudio ?? (voiceChanged ? undefined : existing?.normalAudio),
    slowAudio07: update.slowAudio07 ?? (voiceChanged ? undefined : existing?.slowAudio07),
    slowAudio05: update.slowAudio05 ?? (voiceChanged ? undefined : existing?.slowAudio05),
    audioBySpeed: {
      ...(voiceChanged ? {} : existing?.audioBySpeed),
      ...(update.audioBySpeed ?? {})
    },
    lastUsedAt: Date.now()
  };

  const next: TranslationHistoryEntry = {
    ...nextBase,
    sizeBytes: entrySize(nextBase)
  };

  const entries = (await requestResult(store.getAll())) as TranslationHistoryEntry[];
  const plan = planHistoryEviction(entries, next, TRANSLATION_CACHE_LIMIT_BYTES);

  for (const evictKey of plan.evictKeys) {
    store.delete(evictKey);
    log.info('translation-history', 'Evicted least-recently-used entry', { key: evictKey });
  }

  if (plan.oversized) {
    await done;
    throw new Error('This translation cache entry exceeds the 500 MB storage limit');
  }

  store.put(next);
  await done;
}

export function matchesEntryVoice(
  entry: TranslationHistoryEntry | null | undefined,
  language: 'da' | 'en',
  voice?: string
): boolean {
  if (!entry) return false;
  const expected = voice || DEFAULT_VOICES[language];
  const stored = entry.audioVoice ?? DEFAULT_VOICES[language];
  return stored === expected;
}

export function getEntryAudioForSpeed(
  entry: TranslationHistoryEntry | null | undefined,
  speed: number
): Blob | null {
  if (!entry) return null;
  const fromMap = entry.audioBySpeed?.[formatSpeedKey(speed)];
  if (fromMap) return fromMap;
  if (speed === 1) return entry.normalAudio ?? null;
  if (speed === 0.7) return entry.slowAudio07 ?? null;
  if (speed === 0.5) return entry.slowAudio05 ?? null;
  return null;
}

export function getCachedSpeech(
  userId: string,
  language: 'da' | 'en',
  text: string,
  speed: number,
  voice?: string,
  options?: { touch?: boolean }
): Promise<Blob | null> {
  return getTranslationHistoryEntry(userId, language, text, options).then((entry) => {
    if (!matchesEntryVoice(entry, language, voice)) return null;
    return getEntryAudioForSpeed(entry, speed);
  });
}

export function saveCachedSpeech(
  userId: string,
  language: 'da' | 'en',
  text: string,
  speed: number,
  audio: Blob,
  voice?: string,
  options?: { kind?: HistoryEntryKind }
): Promise<void> {
  if (!Number.isFinite(speed) || speed < 0.4 || speed > 1.5) {
    return Promise.reject(new RangeError(`Unsupported speech speed: ${speed}`));
  }

  const audioVoice = voice || DEFAULT_VOICES[language];
  const key = formatSpeedKey(speed);
  const update: TranslationHistoryUpdate = {
    ...(options?.kind ? { kind: options.kind } : {}),
    audioVoice,
    audioBySpeed: { [key]: audio }
  };

  return updateTranslationHistoryEntry(userId, language, text, update);
}

export async function deleteTranslationHistoryEntryByKey(key: string): Promise<void> {
  if (!key) return;
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAME).delete(key);
  await done;
}

export async function listSelectionHistory(
  userId: string,
  language?: 'da' | 'en'
): Promise<TranslationHistoryEntry[]> {
  if (!userId) return [];
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const entries = (await requestResult(store.getAll())) as TranslationHistoryEntry[];
  return listSortedSelectionEntries(entries, userId, language);
}

export async function getHistoryStorageStats(userId: string): Promise<HistoryStorageStats> {
  if (!userId) {
    return {
      totalBytes: 0,
      selectionBytes: 0,
      selectionCount: 0,
      limitBytes: TRANSLATION_CACHE_LIMIT_BYTES
    };
  }
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const entries = (await requestResult(store.getAll())) as TranslationHistoryEntry[];
  const userEntries = entries.filter((entry) => entry.userId === userId);
  const selectionEntries = userEntries.filter(isSelectionHistoryEntry);
  return {
    totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    selectionBytes: selectionEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    selectionCount: selectionEntries.length,
    limitBytes: TRANSLATION_CACHE_LIMIT_BYTES
  };
}

export async function clearSelectionHistory(userId: string): Promise<void> {
  if (!userId) return;
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(STORE_NAME);
  const entries = (await requestResult(store.getAll())) as TranslationHistoryEntry[];
  for (const entry of entries) {
    if (entry.userId === userId && isSelectionHistoryEntry(entry)) {
      store.delete(entry.key);
    }
  }
  await done;
}
