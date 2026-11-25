export type SpeechLanguage = 'da' | 'en';

export interface TtsVoiceOption {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

export declare const TTS_VOICES: Record<SpeechLanguage, readonly TtsVoiceOption[]>;
export declare const DEFAULT_VOICES: Record<SpeechLanguage, string>;

export function isValidVoice(language: SpeechLanguage, voice: unknown): voice is string;
export function resolveVoice(language: SpeechLanguage, voice: unknown): string;
export function normalizeVoices(input: unknown): Record<SpeechLanguage, string>;
