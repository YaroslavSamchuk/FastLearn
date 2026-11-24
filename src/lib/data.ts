// language: TypeScript, file: src/lib/data.ts, target: Web

import { AppData, Chat, Language, Message, Quota, UserMemories, WordVaultItem } from '../types.ts';
import { log } from './logger';
import { readJson, storageKeys, writeJson } from './storage';

export const DAILY_LIMIT = 30;
export const RESET_HOURS = 15;
const MAX_MESSAGES_PER_CHAT = 300;
const MAX_CHATS = 60;
const MAX_WORDS = 500;

export const DEFAULT_MEMORIES: UserMemories = {
  global: [
    'Рідна мова — українська.',
    'Цінує короткі, природні відповіді без повчань і зайвих слів.'
  ],
  da: ['Вивчає розмовну данську для повсякденного спілкування.'],
  en: ['Практикує природну англійську для роботи та подорожей.']
};

function uid(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newMessageId(): string {
  return uid('msg');
}

export function newWordId(): string {
  return uid('word');
}

export function createChat(language: Language, userId = 'local'): Chat {
  const now = new Date().toISOString();
  return {
    _id: uid('chat'),
    userId,
    language,
    title: language === 'da' ? 'Ny samtale' : 'New conversation',
    createdAt: now,
    updatedAt: now
  };
}

export function createUserMessage(chatId: string, content: string, userId = 'local'): Message {
  return {
    _id: newMessageId(),
    chatId,
    userId,
    role: 'user',
    content,
    createdAt: new Date().toISOString()
  };
}

export function createAssistantMessage(chatId: string, content: string): Message {
  return {
    _id: newMessageId(),
    chatId,
    userId: 'ai',
    role: 'assistant',
    content,
    createdAt: new Date().toISOString()
  };
}

export function normalizeQuota(input?: Partial<Quota> | null): Quota {
  const now = Date.now();
  const resetAt = input?.resetAt ? new Date(input.resetAt).getTime() : 0;
  const validReset = Number.isFinite(resetAt);

  if (!input || !validReset || now >= resetAt) {
    return {
      remaining: DAILY_LIMIT,
      limit: DAILY_LIMIT,
      resetAt: new Date(now + RESET_HOURS * 60 * 60 * 1000).toISOString()
    };
  }

  const limit = Math.max(1, Number(input.limit) || DAILY_LIMIT);
  const remaining = Math.max(0, Math.min(limit, Number(input.remaining)));

  return {
    remaining: Number.isFinite(remaining) ? remaining : limit,
    limit,
    resetAt: input.resetAt as string
  };
}

export function createDefaultData(ownerId: string | null = null): AppData {
  const da = createChat('da');
  const en = createChat('en');
  return {
    ownerId,
    chats: [da, en],
    messages: { [da._id]: [], [en._id]: [] },
    words: [],
    memories: {
      global: [...DEFAULT_MEMORIES.global],
      da: [...DEFAULT_MEMORIES.da],
      en: [...DEFAULT_MEMORIES.en]
    },
    quota: normalizeQuota(),
    activeChatId: { da: da._id, en: en._id }
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function normalizeChat(value: unknown): Chat | null {
  if (!value || typeof value !== 'object') return null;
  const chat = value as Record<string, unknown>;
  if (typeof chat._id !== 'string' || !chat._id) return null;
  if (chat.language !== 'da' && chat.language !== 'en') return null;
  return {
    _id: chat._id,
    userId: typeof chat.userId === 'string' ? chat.userId : 'local',
    language: chat.language,
    title:
      typeof chat.title === 'string' && chat.title.trim()
        ? chat.title.trim().slice(0, 80)
        : chat.language === 'da'
          ? 'Ny samtale'
          : 'New conversation',
    createdAt: typeof chat.createdAt === 'string' ? chat.createdAt : new Date().toISOString(),
    updatedAt: typeof chat.updatedAt === 'string' ? chat.updatedAt : new Date().toISOString()
  };
}

function normalizeMessage(value: unknown, chatId: string): Message | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  if (typeof message.content !== 'string' || !message.content.trim()) return null;
  return {
    _id: typeof message._id === 'string' ? message._id : newMessageId(),
    chatId,
    userId: typeof message.userId === 'string' ? message.userId : 'local',
    role: message.role,
    content: message.content.trim(),
    createdAt: typeof message.createdAt === 'string' ? message.createdAt : new Date().toISOString()
  };
}

function normalizeWord(value: unknown): WordVaultItem | null {
  if (!value || typeof value !== 'object') return null;
  const word = value as Record<string, unknown>;
  if (typeof word.phrase !== 'string' || !word.phrase.trim()) return null;
  if (word.language !== 'da' && word.language !== 'en') return null;
  return {
    _id: typeof word._id === 'string' ? word._id : uid('word'),
    phrase: word.phrase.trim().slice(0, 300),
    translation: typeof word.translation === 'string' ? word.translation.trim().slice(0, 500) : '',
    ipa: typeof word.ipa === 'string' ? word.ipa.trim().slice(0, 200) : '',
    language: word.language,
    createdAt: typeof word.createdAt === 'string' ? word.createdAt : new Date().toISOString()
  };
}

function normalizeData(raw: Partial<AppData>): AppData {
  const fallback = createDefaultData();
  const chats = Array.isArray(raw.chats)
    ? raw.chats.map(normalizeChat).filter((chat): chat is Chat => Boolean(chat)).slice(0, MAX_CHATS)
    : [];

  const safeChats = chats.length > 0 ? chats : fallback.chats;
  const messages: Record<string, Message[]> = {};

  for (const chat of safeChats) {
    const list = Array.isArray(raw.messages?.[chat._id]) ? raw.messages?.[chat._id] : [];
    messages[chat._id] = list
      .map((message) => normalizeMessage(message, chat._id))
      .filter((message): message is Message => Boolean(message))
      .slice(-MAX_MESSAGES_PER_CHAT);
  }

  const words = Array.isArray(raw.words)
    ? raw.words.map(normalizeWord).filter((word): word is WordVaultItem => Boolean(word)).slice(0, MAX_WORDS)
    : [];

  const memories: UserMemories = {
    global: stringList(raw.memories?.global),
    da: stringList(raw.memories?.da),
    en: stringList(raw.memories?.en)
  };
  if (memories.global.length === 0) memories.global = [...DEFAULT_MEMORIES.global];
  if (memories.da.length === 0) memories.da = [...DEFAULT_MEMORIES.da];
  if (memories.en.length === 0) memories.en = [...DEFAULT_MEMORIES.en];

  const activeChatId: Record<Language, string | null> = { da: null, en: null };
  const finalChats = [...safeChats];

  for (const language of ['da', 'en'] as const) {
    const langChats = finalChats.filter((c) => c.language === language);
    const emptyChats = langChats.filter((c) => (messages[c._id]?.length ?? 0) === 0);

    let emptyChat: Chat;
    if (emptyChats.length > 0) {
      emptyChat = emptyChats[0];
      // If there are multiple empty chats for the same language, remove redundant ones
      if (emptyChats.length > 1) {
        const extraIds = new Set(emptyChats.slice(1).map((c) => c._id));
        for (let i = finalChats.length - 1; i >= 0; i--) {
          if (extraIds.has(finalChats[i]?._id)) {
            delete messages[finalChats[i]._id];
            finalChats.splice(i, 1);
          }
        }
      }
    } else {
      emptyChat = createChat(language, typeof raw.ownerId === 'string' ? raw.ownerId : 'local');
      finalChats.unshift(emptyChat);
      messages[emptyChat._id] = [];
    }

    // Default to the empty chat on load (as in Gemini / ChatGPT)
    activeChatId[language] = emptyChat._id;
  }

  return {
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null,
    chats: finalChats,
    messages,
    words,
    memories,
    quota: normalizeQuota(raw.quota),
    activeChatId
  };
}

export function loadData(): AppData {
  const raw = readJson<Partial<AppData> | null>(storageKeys.data, null);
  if (!raw || typeof raw !== 'object') {
    log.info('data', 'No saved data, creating a fresh local workspace');
    return createDefaultData();
  }

  const data = normalizeData(raw);
  log.info('data', 'Local workspace loaded', {
    chats: data.chats.length,
    words: data.words.length,
    messages: Object.values(data.messages).reduce((sum, list) => sum + list.length, 0),
    quota: `${data.quota.remaining}/${data.quota.limit}`
  });
  return data;
}

export function saveData(data: AppData): boolean {
  return writeJson(storageKeys.data, data);
}

export function formatResetAt(resetAt: string): string {
  const diff = new Date(resetAt).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 'зараз';
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) return `${minutes} хв`;
  return `${hours} год ${minutes} хв`;
}

export function trimChatMessages(data: AppData, chatId: string): AppData {
  const list = data.messages[chatId];
  if (!list || list.length <= MAX_MESSAGES_PER_CHAT) return data;
  return {
    ...data,
    messages: {
      ...data.messages,
      [chatId]: list.slice(-MAX_MESSAGES_PER_CHAT)
    }
  };
}
