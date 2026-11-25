import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRANSLATION_CACHE_LIMIT_BYTES,
  entrySize,
  getEntryAudioForSpeed,
  listSortedSelectionEntries,
  makeTranslationHistoryKey,
  planHistoryEviction,
  type TranslationHistoryEntry
} from './translationHistory.ts';

function makeEntry(
  text: string,
  lastUsedAt: number,
  audioBytes = 1000,
  overrides: Partial<TranslationHistoryEntry> = {}
): TranslationHistoryEntry {
  const base = {
    key: makeTranslationHistoryKey('u1', 'da', text),
    userId: 'u1',
    language: 'da' as const,
    text,
    kind: 'selection' as const,
    translation: `переклад ${text}`,
    ipa: `[${text}]`,
    audioBySpeed: {
      '1': new Blob([new Uint8Array(audioBytes)]),
      '0.7': new Blob([new Uint8Array(audioBytes)]),
      '0.5': new Blob([new Uint8Array(audioBytes)])
    },
    lastUsedAt,
    ...overrides
  };
  return {
    ...base,
    sizeBytes: entrySize(base)
  };
}

test('enforces exact 500 MB local storage cap', () => {
  assert.equal(TRANSLATION_CACHE_LIMIT_BYTES, 500 * 1024 * 1024);
});

test('orders selection history newest-first and stores all 3 speeds on one unified entry', () => {
  const older = makeEntry('kaffe', 100);
  const newer = makeEntry('hygge', 300);
  const middle = makeEntry('vejret', 200);
  const fullMessage = makeEntry('En lang besked', 500, 1000, {
    kind: 'message',
    translation: undefined,
    ipa: undefined
  });

  const sorted = listSortedSelectionEntries([older, fullMessage, newer, middle], 'u1');
  assert.deepEqual(
    sorted.map((entry) => entry.text),
    ['hygge', 'vejret', 'kaffe']
  );

  assert.ok(getEntryAudioForSpeed(newer, 1));
  assert.ok(getEntryAudioForSpeed(newer, 0.7));
  assert.ok(getEntryAudioForSpeed(newer, 0.5));
});

test('evicts least-recently-used items when exceeding limit and preserves re-selected items promoted to front', () => {
  const first = makeEntry('først', 100, 300);
  const second = makeEntry('anden', 200, 300);
  const third = makeEntry('tredje', 300, 300);

  // Simulate re-selecting 'først', promoting its lastUsedAt above 'anden' and 'tredje'
  const promotedFirst = { ...first, lastUsedAt: 450 };
  const fourth = makeEntry('fjerde', 500, 300);

  const entries = [promotedFirst, second, third];
  const limit = promotedFirst.sizeBytes + third.sizeBytes + fourth.sizeBytes;
  const plan = planHistoryEviction(entries, fourth, limit);

  assert.equal(plan.oversized, false);
  assert.deepEqual(plan.evictKeys, [second.key]);
  assert.ok(plan.totalBytesAfter <= limit);
});

test('rejects and removes an item that individually exceeds the storage limit', () => {
  const existing = makeEntry('vejret', 100, 200);
  const oversized = makeEntry('vejret', 200, 2000);

  const plan = planHistoryEviction([existing], oversized, 1000);
  assert.equal(plan.oversized, true);
  assert.deepEqual(plan.evictKeys, [existing.key]);
});
