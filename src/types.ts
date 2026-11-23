export type Language = 'da' | 'en';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  currentLanguage: Language;
  voicePreferences: {
    da: string;
    en: string;
  };
  messagesRemaining: number;
  dailyLimit: number;
  resetAt: string;
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

export interface SelectionData {
  text: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
}
