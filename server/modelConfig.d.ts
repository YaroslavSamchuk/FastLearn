export function getThinkingConfig(model: string): {
  thinkingLevel: 'medium' | 'low';
  thinkingBudget?: never;
} | {
  thinkingBudget: number;
  thinkingLevel?: never;
} | null;

export function getChatLanguageInstruction(language: 'da' | 'en'): string;
export function lockLatestUserMessage(content: string, language: 'da' | 'en'): string;
