import type { AppSettings, ChatMessage, ChatSession, WordMap, WordRecord, WordStatus } from '../types';
import { cleanDanishWord } from './dictionary';
import { DEFAULT_MODEL } from './gemini';

const KEYS = {
  SETTINGS: 'fastlearn_v2_settings',
  CHATS: 'fastlearn_v2_chats',
  ACTIVE_CHAT: 'fastlearn_v2_active_chat',
  MESSAGES_PREFIX: 'fastlearn_v2_msg_',
  WORDS_MAP: 'fastlearn_v2_words_map',
  WORDS_LIST: 'fastlearn_v2_words_list',
};

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  model: DEFAULT_MODEL,
  level: 'A1',
  userNotes: 'Початківець. Увага на порядок слів (V2-правило) та правильне вживання en/et.',
  speechRate: 1.0,
  autoSpeakAi: false,
  theme: 'light',
};

export class StorageService {
  /* ================== SETTINGS ================== */
  static getSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(KEYS.SETTINGS);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  static saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated: AppSettings = { ...current, ...settings };
    try {
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
    return updated;
  }

  /* ================== CHATS ================== */
  static getChats(): ChatSession[] {
    try {
      const raw = localStorage.getItem(KEYS.CHATS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static createChat(title?: string): ChatSession {
    const chats = this.getChats();
    const id = 'chat_' + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();
    const newChat: ChatSession = {
      id,
      title: title || 'Нова бесіда датською',
      created_at: now,
      updated_at: now,
    };
    const updated = [newChat, ...chats];
    try {
      localStorage.setItem(KEYS.CHATS, JSON.stringify(updated));
      localStorage.setItem(KEYS.ACTIVE_CHAT, id);
    } catch (e) {
      console.warn('Failed to create chat:', e);
    }
    return newChat;
  }

  static deleteChat(id: string): void {
    const chats = this.getChats().filter(c => c.id !== id);
    try {
      localStorage.setItem(KEYS.CHATS, JSON.stringify(chats));
      localStorage.removeItem(KEYS.MESSAGES_PREFIX + id);
      const active = this.getActiveChatId();
      if (active === id) {
        localStorage.setItem(KEYS.ACTIVE_CHAT, chats[0]?.id || '');
      }
    } catch (e) {
      console.warn('Failed to delete chat:', e);
    }
  }

  static getActiveChatId(): string | null {
    try {
      return localStorage.getItem(KEYS.ACTIVE_CHAT) || null;
    } catch {
      return null;
    }
  }

  static setActiveChatId(id: string): void {
    try {
      localStorage.setItem(KEYS.ACTIVE_CHAT, id);
    } catch (_) {}
  }

  /* ================== MESSAGES ================== */
  static getMessages(chatId: string): ChatMessage[] {
    if (!chatId) return [];
    try {
      const raw = localStorage.getItem(KEYS.MESSAGES_PREFIX + chatId);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static saveMessages(chatId: string, messages: ChatMessage[]): void {
    if (!chatId) return;
    try {
      // Keep last 60 messages per chat to manage storage effortlessly
      localStorage.setItem(KEYS.MESSAGES_PREFIX + chatId, JSON.stringify(messages.slice(-60)));

      // Update last active time for chat
      const chats = this.getChats();
      const idx = chats.findIndex(c => c.id === chatId);
      if (idx !== -1) {
        chats[idx].updated_at = new Date().toISOString();
        // Auto-title from first user message if still default title
        if (chats[idx].title === 'Нова бесіда датською' && messages.length > 0) {
          const firstUser = messages.find(m => m.role === 'user');
          if (firstUser) {
            chats[idx].title = firstUser.content.slice(0, 30) + (firstUser.content.length > 30 ? '...' : '');
          }
        }
        localStorage.setItem(KEYS.CHATS, JSON.stringify(chats));
      }
    } catch (e) {
      console.warn('Failed to save messages:', e);
    }
  }

  /* ================== VOCABULARY & WORDS ================== */
  static getWordsMap(): WordMap {
    try {
      const raw = localStorage.getItem(KEYS.WORDS_MAP);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  static getWordRecords(): WordRecord[] {
    try {
      const raw = localStorage.getItem(KEYS.WORDS_LIST);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static saveWord(record: Omit<WordRecord, 'created_at' | 'updated_at'>): WordRecord {
    const clean = cleanDanishWord(record.word_clean || record.word);
    const now = new Date().toISOString();
    const words = this.getWordRecords();
    const existingIdx = words.findIndex(w => w.word_clean === clean);

    const fullRecord: WordRecord = {
      ...record,
      word_clean: clean,
      created_at: existingIdx !== -1 ? words[existingIdx].created_at : now,
      updated_at: now,
    };

    if (existingIdx !== -1) {
      words[existingIdx] = fullRecord;
    } else {
      words.unshift(fullRecord);
    }

    // Also update words map for fast lookup
    const map = this.getWordsMap();
    map[clean] = {
      status: record.status,
      translation_uk: record.translation_uk,
      synonyms: record.synonyms,
    };

    try {
      localStorage.setItem(KEYS.WORDS_LIST, JSON.stringify(words));
      localStorage.setItem(KEYS.WORDS_MAP, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to save word:', e);
    }

    return fullRecord;
  }

  static updateWordStatus(word: string, status: WordStatus): void {
    const clean = cleanDanishWord(word);
    if (!clean) return;

    const map = this.getWordsMap();
    const words = this.getWordRecords();
    const existingIdx = words.findIndex(w => w.word_clean === clean);

    if (existingIdx !== -1) {
      words[existingIdx].status = status;
      words[existingIdx].updated_at = new Date().toISOString();
      map[clean] = {
        status,
        translation_uk: words[existingIdx].translation_uk,
        synonyms: words[existingIdx].synonyms,
      };
    } else {
      // First time setting status on an unregistered word
      const now = new Date().toISOString();
      const newRec: WordRecord = {
        word,
        word_clean: clean,
        status,
        translation_uk: '',
        created_at: now,
        updated_at: now,
      };
      words.unshift(newRec);
      map[clean] = { status, translation_uk: '' };
    }

    try {
      localStorage.setItem(KEYS.WORDS_LIST, JSON.stringify(words));
      localStorage.setItem(KEYS.WORDS_MAP, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to update word status:', e);
    }
  }

  static deleteWord(word: string): void {
    const clean = cleanDanishWord(word);
    const words = this.getWordRecords().filter(w => w.word_clean !== clean);
    const map = this.getWordsMap();
    delete map[clean];

    try {
      localStorage.setItem(KEYS.WORDS_LIST, JSON.stringify(words));
      localStorage.setItem(KEYS.WORDS_MAP, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to delete word:', e);
    }
  }

  /* ================== EXPORT & IMPORT ================== */
  static exportAllData(): string {
    const data = {
      version: 2,
      export_date: new Date().toISOString(),
      settings: this.getSettings(),
      chats: this.getChats(),
      words: this.getWordRecords(),
    };
    return JSON.stringify(data, null, 2);
  }

  static importAllData(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (data.settings) {
        localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data.settings));
      }
      if (Array.isArray(data.chats)) {
        localStorage.setItem(KEYS.CHATS, JSON.stringify(data.chats));
      }
      if (Array.isArray(data.words)) {
        localStorage.setItem(KEYS.WORDS_LIST, JSON.stringify(data.words));
        const map: WordMap = {};
        for (const w of data.words) {
          if (w.word_clean) {
            map[w.word_clean] = {
              status: w.status,
              translation_uk: w.translation_uk || '',
              synonyms: w.synonyms,
            };
          }
        }
        localStorage.setItem(KEYS.WORDS_MAP, JSON.stringify(map));
      }
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }

  static exportAnkiCsv(): string {
    const words = this.getWordRecords();
    const rows = ['Dansk\tUkrainsk\tSynonymer\tNoter'];
    for (const w of words) {
      const cleanSyn = (w.synonyms || []).join(', ');
      const cleanNote = (w.notes || '').replace(/\t|\n/g, ' ');
      rows.push(`${w.word}\t${w.translation_uk || ''}\t${cleanSyn}\t${cleanNote}`);
    }
    return rows.join('\n');
  }
}
