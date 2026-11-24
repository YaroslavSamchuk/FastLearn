import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getChatLanguageInstruction,
  getThinkingConfig,
  lockLatestUserMessage
} from './modelConfig.js';
import { BASE_PROMPTS } from './llm.js';

test('sets medium thinking on supported Gemini 3 chat models', () => {
  assert.deepEqual(getThinkingConfig('gemini-3-flash-preview'), { thinkingLevel: 'medium' });
  assert.deepEqual(getThinkingConfig('gemini-flash-lite-latest'), { thinkingLevel: 'medium' });
});

test('uses supported thinking settings for other Gemini model generations', () => {
  assert.deepEqual(getThinkingConfig('gemini-2.5-flash'), { thinkingBudget: 4096 });
  assert.deepEqual(getThinkingConfig('gemini-3-pro-preview'), { thinkingLevel: 'low' });
  assert.equal(getThinkingConfig('gemma-4-26b-a4b-it'), null);
});

test('locks Danish chat replies regardless of the user message language', () => {
  const instruction = getChatLanguageInstruction('da');
  assert.match(instruction, /entire conversational reply in Danish/);
  assert.match(instruction, /A Ukrainian message is not a request to switch languages/);
  assert.match(lockLatestUserMessage('Привіт', 'da'), /LATEST USER MESSAGE:\nПривіт$/);
  assert.match(BASE_PROMPTS.da, /Svar altid på dansk/);
  assert.match(BASE_PROMPTS.da, /Rettet:/);
  assert.doesNotMatch(BASE_PROMPTS.da, /Svar normalt på dansk|Виправлено:|Розмовніше:/);
});
