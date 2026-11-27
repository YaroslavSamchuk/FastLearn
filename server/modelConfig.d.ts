export const MAX_FACT_CHARS: number;
export const MAX_FACTS_PER_SCOPE: number;
export const DEFAULT_GEMINI_MODEL_LIST: string[];
export const DEFAULT_GEMINI_MODELS: string;

export function getThinkingConfig(model: string): {
  thinkingLevel: 'medium' | 'low';
  thinkingBudget?: never;
} | {
  thinkingBudget: number;
  thinkingLevel?: never;
} | null;

export function getFastThinkingConfig(model: string): {
  thinkingLevel: 'minimal' | 'low';
  thinkingBudget?: never;
} | {
  thinkingBudget: number;
  thinkingLevel?: never;
} | null;

export function getChatLanguageInstruction(language: 'da' | 'en'): string;

export const MEMORY_TOOL_DECLARATIONS: Array<{
  name: 'save_memory' | 'update_memory' | 'forget_memory';
  description: string;
  parameters: Record<string, unknown>;
}>;

export const SEARCH_TOOL_DECLARATIONS: Array<{
  name:
    | 'web_search'
    | 'media_search'
    | 'wiki_search'
    | 'wiki_page'
    | 'news_search'
    | 'fetch_url'
    | 'research_topic';
  description: string;
  parameters: Record<string, unknown>;
}>;

export const ALL_TOOL_DECLARATIONS: Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}>;

export const BASE_PROMPTS: Record<'da' | 'en', string>;

export function buildSystemPrompt(
  language?: 'da' | 'en',
  userMemories?: { global?: string[]; da?: string[]; en?: string[] } | null,
  enableTools?: boolean
): string;

export function buildPrimingAcknowledgement(language?: 'da' | 'en'): string;
export function lockLatestUserMessage(content: string, language: 'da' | 'en'): string;
