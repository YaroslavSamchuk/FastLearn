import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialWaitingState,
  describeWaitingState,
  reduceWaitingState
} from './waitingStatus.ts';

test('transitions cleanly through thinking -> searching -> analyzing -> searching -> thinking', () => {
  let state = createInitialWaitingState();
  assert.deepEqual(describeWaitingState(state), {
    label: 'Думає',
    trail: null,
    icon: 'brand'
  });

  state = reduceWaitingState(state, {
    phase: 'searching',
    tools: ['web_search', 'web_search', 'web_search'],
    count: 3
  });
  assert.deepEqual(describeWaitingState(state), {
    label: 'Шукає в мережі · 3 запити',
    trail: null,
    icon: 'web'
  });

  state = reduceWaitingState(state, {
    phase: 'analyzing',
    tools: ['web_search', 'web_search', 'web_search'],
    count: 3
  });
  assert.deepEqual(describeWaitingState(state), {
    label: 'Аналізує результати',
    trail: 'Перевірено 3 запити',
    icon: 'brand'
  });

  state = reduceWaitingState(state, {
    phase: 'searching',
    tools: ['wiki_page'],
    count: 1
  });
  assert.deepEqual(describeWaitingState(state), {
    label: 'Читає статтю у Вікіпедії',
    trail: 'Перевірено 3 запити',
    icon: 'wiki'
  });

  state = reduceWaitingState(state, {
    phase: 'analyzing',
    tools: ['wiki_page'],
    count: 1
  });
  assert.deepEqual(describeWaitingState(state), {
    label: 'Аналізує результати',
    trail: 'Перевірено 4 запити',
    icon: 'brand'
  });
});

test('formats media_search sources concisely without trailing punctuation', () => {
  const state = reduceWaitingState(createInitialWaitingState(), {
    phase: 'searching',
    tools: ['media_search'],
    sources: ['github', 'reddit'],
    count: 1
  });
  assert.equal(describeWaitingState(state).label, 'Шукає в медіа · GitHub, Reddit');
});
