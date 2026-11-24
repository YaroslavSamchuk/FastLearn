import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMemoryTool } from './memory.js';

const initialMemories = () => ({
  global: ['Prefers concise replies'],
  da: ['Practicing Danish'],
  en: []
});

test('saves a new memory without mutating existing history', () => {
  const memories = initialMemories();
  const result = applyMemoryTool(memories, 'save_memory', {
    scope: 'global',
    fact: '  Likes hiking  '
  });

  assert.deepEqual(result.memories.global, ['Prefers concise replies', 'Likes hiking']);
  assert.deepEqual(memories.global, ['Prefers concise replies']);
  assert.deepEqual(result.event, {
    action: 'save',
    scope: 'global',
    fact: 'Likes hiking'
  });
});

test('does not duplicate an existing fact or overwrite it during an invalid update', () => {
  const memories = initialMemories();

  const duplicate = applyMemoryTool(memories, 'save_memory', {
    scope: 'global',
    fact: 'Prefers concise replies'
  });
  const missing = applyMemoryTool(memories, 'update_memory', {
    scope: 'global',
    previousFact: 'A fact that does not exist',
    fact: 'Changed fact'
  });

  assert.equal(duplicate.event, undefined);
  assert.equal(missing.result.ok, false);
  assert.deepEqual(missing.memories.global, ['Prefers concise replies']);
});

test('updates and forgets only the exact requested memory', () => {
  const memories = initialMemories();
  const updated = applyMemoryTool(memories, 'update_memory', {
    scope: 'da',
    previousFact: 'Practicing Danish',
    fact: 'Practicing conversational Danish'
  });
  const forgotten = applyMemoryTool(updated.memories, 'forget_memory', {
    scope: 'da',
    fact: 'Practicing conversational Danish'
  });

  assert.deepEqual(updated.event, {
    action: 'update',
    scope: 'da',
    previousFact: 'Practicing Danish',
    fact: 'Practicing conversational Danish'
  });
  assert.deepEqual(forgotten.event, {
    action: 'forget',
    scope: 'da',
    fact: 'Practicing conversational Danish'
  });
  assert.deepEqual(forgotten.memories.da, []);
});
