import { log } from './logger.ts';

export const TRANSLATION_CACHE_LIMIT_BYTES = 300 * 1024 * 1024;

export interface TranslationHistoryEntry {
  key: string;
  userId: string;
  language: 'da' | 'en';
  text: string;
  translation?: string;
  ipa?: string;
  normalAudio?: Blob;
  slowAudio07?: Blob;
  slowAudio05?: Blob;
  sizeBytes: number;
  lastUsedAt: number;
}

type TranslationHistoryUpdate = Partial<
  Pick<TranslationHistoryEntry, 'translation' | 'ipa' | 'normalAudio' | 'slowAudio07' | 'slowAudio05'>
>;

const DATABASE_NAME = 'fastlearn_translation_history';
const STORE_NAME = 'entries';
const DATABASE_VERSION = 2;
let databasePromise: Promise<IDBDatabase> | null = null;

function makeKey(userId: string, language: 'da' | 'en', text: string): string {
  return `${userId}:${language}:${text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser'));
  }

  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('lastUsedAt', 'lastUsedAt');
      } else if (event.oldVersion < 2) {
        const store = request.transaction?.objectStore(STORE_NAME);
        if (!store) {
          reject(new Error('Could not access translation history during its upgrade'));
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
          entry.sizeBytes = entrySize(entry);
          cursor.update(entry);
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onclose = () => {
        databasePromise = null;
      };
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open translation history'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Translation history database upgrade is blocked'));
    };
  });

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Translation history request failed'));
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

function entrySize(entry: Omit<TranslationHistoryEntry, 'sizeBytes'>): number {
  const textBytes = new TextEncoder().encode(
    `${entry.userId}\u0000${entry.language}\u0000${entry.text}\u0000${entry.translation ?? ''}\u0000${entry.ipa ?? ''}`
  ).byteLength;
  return textBytes
    + (entry.normalAudio?.size ?? 0)
    + (entry.slowAudio07?.size ?? 0)
    + (entry.slowAudio05?.size ?? 0);
}

export async function getTranslationHistoryEntry(
  userId: string,
  language: 'da' | 'en',
  text: string
): Promise<TranslationHistoryEntry | null> {
  if (!userId || !text.trim()) return null;

  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const key = makeKey(userId, language, text);
  const entry = await requestResult(store.get(key)) as TranslationHistoryEntry | undefined;

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
  const key = makeKey(userId, language, text);
  const existing = await requestResult(store.get(key)) as TranslationHistoryEntry | undefined;
  const nextBase = {
    key,
    userId,
    language,
    text: text.trim().replace(/\s+/g, ' '),
    translation: update.translation ?? existing?.translation,
    ipa: update.ipa ?? existing?.ipa,
    normalAudio: update.normalAudio ?? existing?.normalAudio,
    slowAudio07: update.slowAudio07 ?? existing?.slowAudio07,
    slowAudio05: update.slowAudio05 ?? existing?.slowAudio05,
    lastUsedAt: Date.now()
  };
  const next: TranslationHistoryEntry = {
    ...nextBase,
    sizeBytes: entrySize(nextBase)
  };
  if (next.sizeBytes > TRANSLATION_CACHE_LIMIT_BYTES) {
    await done;
    throw new Error('This translation cache entry exceeds the 300 MB storage limit');
  }

  const entries = await requestResult(store.getAll()) as TranslationHistoryEntry[];
  let totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
    - (existing?.sizeBytes ?? 0)
    + next.sizeBytes;

  const oldestFirst = entries
    .filter((entry) => entry.key !== key)
    .sort((left, right) => left.lastUsedAt - right.lastUsedAt);

  for (const entry of oldestFirst) {
    if (totalBytes <= TRANSLATION_CACHE_LIMIT_BYTES) break;
    store.delete(entry.key);
    totalBytes -= entry.sizeBytes;
    log.info('translation-history', 'Evicted least-recently-used entry', {
      language: entry.language,
      sizeBytes: entry.sizeBytes
    });
  }

  store.put(next);
  await done;
}

export function getCachedSpeech(
  userId: string,
  language: 'da' | 'en',
  text: string,
  speed: number
): Promise<Blob | null> {
  return getTranslationHistoryEntry(userId, language, text).then((entry) => {
    if (speed === 1) return entry?.normalAudio ?? null;
    if (speed === 0.7) return entry?.slowAudio07 ?? null;
    if (speed === 0.5) return entry?.slowAudio05 ?? null;
    return null;
  });
}

export function saveCachedSpeech(
  userId: string,
  language: 'da' | 'en',
  text: string,
  speed: number,
  audio: Blob
): Promise<void> {
  const update =
    speed === 1
      ? { normalAudio: audio }
      : speed === 0.7
        ? { slowAudio07: audio }
        : speed === 0.5
          ? { slowAudio05: audio }
          : null;
  if (!update) return Promise.reject(new RangeError(`Unsupported speech speed: ${speed}`));

  return updateTranslationHistoryEntry(
    userId,
    language,
    text,
    update
  );
}
