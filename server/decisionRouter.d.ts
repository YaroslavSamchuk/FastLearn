export const DECISIONS_ENDPOINT: string;
export const DECISION_MODEL: string;
export const MAX_DECISION_CANDIDATES: number;
export const MAX_DECISION_INPUT_CHARS: number;
export const MAX_DECISION_RPM_TOKENS: number;
export const DEFAULT_DECISION_TIMEOUT_MS: number;
export const MAX_MAIN_CONTENT_CHARS: number;
export const MAX_FETCH_TOP_CONTENT_CHARS: number;

export function canUseDecisionBudget(estimatedInputTokens: number, now?: number): boolean;
export function resetDecisionLimiterForTests(): void;
export function extractMainContentExcerpt(rawText: string, query?: string, maxChars?: number): string;
export function buildDecisionDigest(
  query: string,
  candidates: Array<Record<string, unknown>>
): { text: string; evaluatedCount: number };

export function rankSearchCandidatesWithDecision1<T extends Record<string, unknown>>(
  rawItems: T[],
  options?: {
    query?: string;
    apiKey?: string;
    fetchTop?: number;
    maxKeep?: number;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  }
): Promise<{
  items: T[];
  fetchCandidateIndices: number[];
  usedDecisionApi: boolean;
  prunedCount: number;
}>;

export function distillToolPayloadContent<T>(result: T, query?: string): T;
