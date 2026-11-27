import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_TOOL_DECLARATIONS,
  BASE_PROMPTS,
  DEFAULT_GEMINI_MODEL_LIST,
  SEARCH_TOOL_DECLARATIONS,
  buildPrimingAcknowledgement,
  buildSystemPrompt,
  getChatLanguageInstruction,
  getFastThinkingConfig,
  getThinkingConfig,
  lockLatestUserMessage
} from './modelConfig.js';

test('sets medium thinking on supported Gemini 3 chat models', () => {
  assert.deepEqual(DEFAULT_GEMINI_MODEL_LIST, [
    'gemma-4-31b-it',
    'gemma-4-26b-a4b-it',
    'gemini-flash-lite-latest'
  ]);
  assert.deepEqual(getThinkingConfig('gemini-3-flash-preview'), { thinkingLevel: 'medium' });
  assert.deepEqual(getThinkingConfig('gemini-flash-lite-latest'), { thinkingLevel: 'medium' });
});

test('uses supported thinking settings for other Gemini model generations', () => {
  assert.deepEqual(getThinkingConfig('gemini-2.5-flash'), { thinkingBudget: 4096 });
  assert.deepEqual(getThinkingConfig('gemini-3-pro-preview'), { thinkingLevel: 'low' });
  assert.equal(getThinkingConfig('gemma-4-26b-a4b-it'), null);
});

test('uses minimal or zero thinking for low-latency translation calls', () => {
  assert.deepEqual(getFastThinkingConfig('gemini-flash-lite-latest'), { thinkingLevel: 'minimal' });
  assert.deepEqual(getFastThinkingConfig('gemini-3-flash-preview'), { thinkingLevel: 'minimal' });
  assert.deepEqual(getFastThinkingConfig('gemini-2.5-flash'), { thinkingBudget: 0 });
  assert.deepEqual(getFastThinkingConfig('gemini-3-pro-preview'), { thinkingLevel: 'low' });
  assert.deepEqual(getFastThinkingConfig('gemma-4-26b-a4b-it'), { thinkingLevel: 'minimal' });
  assert.deepEqual(getFastThinkingConfig('gemma-4-31b-it'), { thinkingLevel: 'minimal' });
});

test('locks Danish and English chat replies exclusively to the selected language', () => {
  const daInstruction = getChatLanguageInstruction('da');
  assert.match(daInstruction, /strictly in Danish/);
  assert.match(daInstruction, /Never switch conversation language/);
  assert.match(lockLatestUserMessage('Привіт', 'da'), /LATEST USER MESSAGE:\nПривіт$/);
  assert.match(BASE_PROMPTS.da, /Svar altid på dansk/);
  assert.match(BASE_PROMPTS.da, /Rettet:/);
  assert.match(BASE_PROMPTS.da, /Mere naturligt:/);
  assert.doesNotMatch(BASE_PROMPTS.da, /Svar normalt på dansk|Виправлено:|Розмовніше:/);

  const enInstruction = getChatLanguageInstruction('en');
  assert.match(enInstruction, /strictly in English/);
  assert.match(BASE_PROMPTS.en, /Reply strictly in English/);
  assert.match(BASE_PROMPTS.en, /Corrected:/);
  assert.match(BASE_PROMPTS.en, /More natural:/);
  assert.doesNotMatch(BASE_PROMPTS.en, /Normally answer in English|Виправлено:|Розмовніше:/);
});

test('builds adaptive coaching and memory protocol prompts without hardcoding contradictions', () => {
  const daPrompt = buildSystemPrompt(
    'da',
    { global: ['Працює інженером'], da: ['Рівень A2'] },
    true
  );
  assert.match(daPrompt, /Працює інженером/);
  assert.match(daPrompt, /Рівень A2/);
  assert.match(daPrompt, /save_memory/);
  assert.match(daPrompt, /web_search/);
  assert.match(daPrompt, /media_search/);
  assert.match(daPrompt, /ADAPTIV UNDERVISNING/);
  assert.match(buildPrimingAcknowledgement('da'), /udelukkende på dansk/);
  assert.match(buildPrimingAcknowledgement('en'), /strictly in English/);
});

test('exposes valid Gemini functionDeclarations for all search and memory tools', () => {
  const names = ALL_TOOL_DECLARATIONS.map((tool) => tool.name);
  assert.equal(SEARCH_TOOL_DECLARATIONS.length, 7);
  for (const expected of [
    'save_memory',
    'update_memory',
    'forget_memory',
    'web_search',
    'media_search',
    'wiki_search',
    'wiki_page',
    'news_search',
    'fetch_url',
    'research_topic'
  ]) {
    assert.equal(names.includes(expected), true);
  }
});
