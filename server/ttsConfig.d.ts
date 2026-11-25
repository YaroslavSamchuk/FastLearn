export type SpeechLanguage = 'da' | 'en';

export interface TtsVoiceOption {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

export type PlaybackSpeedsTuple = [number, number, number];

export declare const TTS_VOICES: Record<SpeechLanguage, readonly TtsVoiceOption[]>;
export declare const DEFAULT_VOICES: Record<SpeechLanguage, string>;
export declare const MIN_PLAYBACK_SPEED: number;
export declare const MAX_PLAYBACK_SPEED: number;
export declare const PLAYBACK_SPEED_STEP: number;
export declare const DEFAULT_PLAYBACK_SPEEDS: Record<SpeechLanguage, PlaybackSpeedsTuple>;

export function isValidVoice(language: SpeechLanguage, voice: unknown): voice is string;
export function resolveVoice(language: SpeechLanguage, voice: unknown): string;
export function normalizeVoices(input: unknown): Record<SpeechLanguage, string>;
export function normalizeSpeedValue(value: unknown, fallback?: number): number;
export function normalizeSpeedTuple(input: unknown, fallback?: PlaybackSpeedsTuple): PlaybackSpeedsTuple;
export function normalizePlaybackSpeeds(input: unknown): Record<SpeechLanguage, PlaybackSpeedsTuple>;
