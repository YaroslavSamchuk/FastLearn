export type WordStatus = 0 | 1 | 2 | 3; // 0=New, 1=Learning 1, 2=Learning 2, 3=Known

export interface CorrectionData {
  has_correction: boolean;
  what_you_meant_uk: string;
  natural_danish: string;
  explanation_uk: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  correction?: CorrectionData | null;
  timestamp: string;
  model_used?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface WordRecord {
  word: string;
  word_clean: string;
  status: WordStatus;
  translation_uk: string;
  synonyms?: string[];
  part_of_speech?: string;
  explanation_uk?: string;
  notes?: string;
  sentence_context?: string;
  created_at: string;
  updated_at: string;
}

export type WordMap = Record<string, {
  status: WordStatus;
  translation_uk: string;
  synonyms?: string[];
}>;

export interface AppSettings {
  apiKey: string;
  model: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  userNotes: string;
  speechRate: number;
  autoSpeakAi: boolean;
  theme: 'light' | 'dark' | 'amber';
}

export interface TranslationResult {
  word: string;
  word_clean: string;
  translation_uk: string;
  synonyms: string[];
  part_of_speech?: string;
  explanation_uk?: string;
}
