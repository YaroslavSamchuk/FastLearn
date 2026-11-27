export const MAX_COMPACT_SOURCES: number;
export const DETAILED_ASSISTANT_TURNS: number;
export const MAX_CHAT_HISTORY_MESSAGES: number;

export interface CompactSource {
  site: string;
  title: string;
  url?: string;
  note?: string;
}

export function sanitizeTimeZone(timeZone: unknown): string;
export function sanitizeCreatedAt(value: unknown): string | undefined;
export function formatMessageTimestamp(createdAt: unknown, timeZone?: string): string;
export function buildChatContextTurns(
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    createdAt?: string;
    sources?: CompactSource[];
  }>,
  options?: {
    language?: 'da' | 'en';
    timeZone?: string;
    lockLatestMessage?: (content: string, language: 'da' | 'en') => string;
    maxMessages?: number;
    nowIso?: string;
  }
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;

export function extractSearchDigest(batchResults: unknown[], maxItems?: number): CompactSource[];

export function sanitizeMessageSources(
  rawSources: unknown,
  options?: { compactOnly?: boolean; maxItems?: number }
): CompactSource[];

export function compactMessagesSources<T extends { role?: string; sources?: unknown }>(
  messages: T[],
  keepDetailedTurns?: number
): T[];

export function formatAssistantContextWithSources(
  content: string,
  sources: CompactSource[] | undefined,
  assistantAgeFromEnd: number
): string;

export function compactEarlierRoundToolResult(result: unknown): unknown;
export function compactActiveContentsToolHistory<T>(activeContents: T[]): T[];
