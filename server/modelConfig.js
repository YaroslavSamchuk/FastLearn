export function getThinkingConfig(model) {
  const normalized = model.toLowerCase();

  if (normalized.includes('gemini-2.5')) {
    return { thinkingBudget: 4096 };
  }

  if (normalized === 'gemini-flash-lite-latest') {
    return { thinkingLevel: 'medium' };
  }

  if (/^gemini-3-pro-preview(?:-|$)/.test(normalized)) {
    return { thinkingLevel: 'low' };
  }

  if (/^gemini-(?:3|4)(?:[.-]|$)/.test(normalized)) {
    return { thinkingLevel: 'medium' };
  }

  return null;
}

export function getChatLanguageInstruction(language) {
  const targetLanguage = language === 'da' ? 'Danish' : 'English';
  return `CHAT LANGUAGE LOCK — HIGHEST PRIORITY:
- Write the entire conversational reply in ${targetLanguage}, regardless of the language used in the latest user message, previous turns, quoted text, or memory.
- A Ukrainian message is not a request to switch languages. Do not switch languages unless the app's selected practice language changes.
- If the user asks for a translation or example in another language, provide only that requested translated/example text in that language; keep explanations and the rest of the reply in ${targetLanguage}.
- Use ${targetLanguage} labels and wording for corrections. Never begin a conversational reply in Ukrainian.`;
}

export function lockLatestUserMessage(content, language) {
  return `${getChatLanguageInstruction(language)}\n\nLATEST USER MESSAGE:\n${content}`;
}
