export type Language = 'da' | 'en';
export type VoiceMap = Record<Language, string>;
export type PlaybackSpeedsTuple = [number, number, number];
export type PlaybackSpeedMap = Record<Language, PlaybackSpeedsTuple>;

export interface UserMemories {
  global: string[];
  da: string[];
  en: string[];
}

export interface MemoryToolEvent {
  action: 'save' | 'update' | 'forget';
  scope: keyof UserMemories;
  fact: string;
  previousFact?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  currentLanguage: Language;
}

export interface Chat {
  _id: string;
  userId: string;
  language: Language;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id?: string;
  chatId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface WordVaultItem {
  _id?: string;
  phrase: string;
  translation: string;
  ipa: string;
  language: Language;
  createdAt: string;
}

export interface Quota {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface AppData {
  ownerId?: string | null;
  chats: Chat[];
  messages: Record<string, Message[]>;
  words: WordVaultItem[];
  memories: UserMemories;
  quota: Quota;
  activeChatId: Record<Language, string | null>;
  voices: VoiceMap;
  playbackSpeeds: PlaybackSpeedMap;
}

export interface SelectionData {
  id: number;
  text: string;
  x: number;
  y: number;
  anchorTop: number;
  anchorBottom: number;
  placement: 'top' | 'bottom';
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | boolean | undefined>;
  }
}
