export const MAX_FACT_CHARS: number;
export const MAX_FACTS_PER_SCOPE: number;

export function getThinkingConfig(model: string): {
  thinkingLevel: 'medium' | 'low';
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

export const BASE_PROMPTS: Record<'da' | 'en', string>;

export function buildSystemPrompt(
  language?: 'da' | 'en',
  userMemories?: { global?: string[]; da?: string[]; en?: string[] } | null,
  enableTools?: boolean
): string;

export function buildPrimingAcknowledgement(language?: 'da' | 'en'): string;
export function lockLatestUserMessage(content: string, language: 'da' | 'en'): string;
