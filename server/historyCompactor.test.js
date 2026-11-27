import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChatContextTurns,
  compactActiveContentsToolHistory,
  compactMessagesSources,
  extractSearchDigest,
  formatAssistantContextWithSources,
  formatMessageTimestamp
} from './historyCompactor.js';

test('extracts deduplicated compact sources capped at 15 items', () => {
  const results = Array.from({ length: 20 }, (_, i) => ({
    title: `Title ${i + 1}`,
    url: `https://site${i + 1}.example.com/page`,
    site: `site${i + 1}.example.com`,
    snippet: `Snippet text ${i + 1}`
  }));
  const digest = extractSearchDigest([{ ok: true, results }]);
  assert.equal(digest.length, 15);
  assert.equal(digest[0].site, 'site1.example.com');
  assert.equal(digest[0].title, 'Title 1');
  assert.ok(digest[0].note);
});

test('keeps notes on latest 2 assistant turns and compacts older messages to site + title only', () => {
  const history = [
    {
      role: 'assistant',
      content: 'First reply',
      sources: [{ site: 'github.com', title: 'Repo A', url: 'https://github.com/a', note: 'Old note' }]
    },
    {
      role: 'assistant',
      content: 'Second reply',
      sources: [{ site: 'reddit.com', title: 'Thread B', url: 'https://reddit.com/b', note: 'Mid note' }]
    },
    {
      role: 'assistant',
      content: 'Third reply',
      sources: [{ site: 'en.wikipedia.org', title: 'Denmark', url: 'https://en.wikipedia.org/wiki/Denmark', note: 'Recent note' }]
    }
  ];

  const compacted = compactMessagesSources(history, 2);
  assert.equal(compacted[0].sources[0].note, undefined);
  assert.equal(compacted[0].sources[0].url, undefined);
  assert.deepEqual(compacted[0].sources[0], { site: 'github.com', title: 'Repo A' });
  assert.equal(compacted[1].sources[0].note, 'Mid note');
  assert.equal(compacted[2].sources[0].note, 'Recent note');

  assert.match(formatAssistantContextWithSources('Old', history[0].sources, 3), /\[Earlier sources: github\.com \(Repo A\)\]/);
  assert.match(formatAssistantContextWithSources('New', history[2].sources, 1), /\[Checked sources: en\.wikipedia\.org — Denmark: Recent note\]/);
});

test('compacts older tool-response turns inside activeContents while keeping the latest turn full', () => {
  const contents = [
    { role: 'user', parts: [{ text: 'Q' }] },
    { role: 'model', parts: [{ functionCall: { name: 'web_search', args: { query: 'first' } } }] },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'web_search',
            response: {
              result: {
                ok: true,
                query: 'first',
                results: [{ site: 'a.com', title: 'A', url: 'https://a.com', snippet: 'S', content: 'VERY LONG CONTENT '.repeat(40) }]
              }
            }
          }
        }
      ]
    },
    { role: 'model', parts: [{ functionCall: { name: 'fetch_url', args: { url: 'https://b.com' } } }] },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'fetch_url',
            response: {
              result: {
                ok: true,
                url: 'https://b.com',
                site: 'b.com',
                title: 'B',
                content: 'FRESH CONTENT'
              }
            }
          }
        }
      ]
    }
  ];

  const trimmed = compactActiveContentsToolHistory(contents);
  const olderResult = trimmed[2].parts[0].functionResponse.response.result;
  const latestResult = trimmed[4].parts[0].functionResponse.response.result;
  assert.equal(olderResult.compacted, true);
  assert.equal(olderResult.web_results, undefined);
  assert.equal(olderResult.results[0].site, 'a.com');
  assert.equal(latestResult.content, 'FRESH CONTENT');
});

test('keeps 15-message history window and formats per-message date/time in requested timezone', () => {
  const history = Array.from({ length: 19 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i + 1}`,
    createdAt: `2026-11-27T10:${String(i).padStart(2, '0')}:00.000Z`
  }));

  const turns = buildChatContextTurns(history, {
    language: 'da',
    timeZone: 'Europe/Copenhagen',
    lockLatestMessage: (text) => `LOCKED\n${text}`
  });

  assert.equal(turns.length, 15);
  assert.match(turns[0].parts[0].text, /^\[Fri 2026-11-27 11:04 (GMT\+1|CET)\]\nMessage 5$/);
  assert.match(turns[14].parts[0].text, /^LOCKED\n\[Fri 2026-11-27 11:18 (GMT\+1|CET)\]\nMessage 19$/);
  assert.equal(formatMessageTimestamp('2026-11-27T11:17:00.000Z', 'Invalid/Zone'), '[Fri 2026-11-27 11:17 UTC]');
});
