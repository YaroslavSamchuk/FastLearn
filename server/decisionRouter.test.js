import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DECISIONS_ENDPOINT,
  MAX_DECISION_INPUT_CHARS,
  buildDecisionDigest,
  distillToolPayloadContent,
  extractMainContentExcerpt,
  rankSearchCandidatesWithDecision1,
  resetDecisionLimiterForTests
} from './decisionRouter.js';

test('extractMainContentExcerpt strips nav chrome, cookie banners, and prioritizes relevant prose', () => {
  const rawPage = [
    'Skip to main content',
    '[Home](/) | [Docs](/docs) | [Pricing](/pricing) | [Blog](/blog) | [Login](/login)',
    'Accept all cookies to continue browsing.',
    '# Node.js 22 Highlights',
    'Node.js 22 upgrades the V8 JavaScript engine to 12.4 and adds native WebSocket client support.',
    'Unrelated marketing fluff about cloud billing dashboards and enterprise sales webinars.'.repeat(40),
    'Node.js 22 also stabilizes watch mode and improves stream defaultHighWaterMark performance.',
    'Privacy Policy | Terms of Service',
    '© 2026 Example Corp All rights reserved'
  ].join('\n\n');

  const excerpt = extractMainContentExcerpt(rawPage, 'Node.js 22 V8 performance', 420);
  assert.doesNotMatch(excerpt, /Skip to main content|Accept all cookies|Privacy Policy|All rights reserved/);
  assert.match(excerpt, /V8 JavaScript engine to 12\.4/);
  assert.match(excerpt, /defaultHighWaterMark performance/);
  assert.ok(excerpt.length <= 420);
});

test('buildDecisionDigest keeps input compact without full page content', () => {
  const bigItems = Array.from({ length: 15 }, (_, i) => ({
    site: `site${i}.example`,
    title: `Article Title ${i} `.repeat(3),
    url: `https://site${i}.example/article`,
    snippet: `Short snippet ${i} about topic.`,
    content: 'FULL PAGE DUMP '.repeat(500)
  }));

  const digest = buildDecisionDigest('Node.js 22 performance', bigItems);
  assert.ok(digest.text.length <= MAX_DECISION_INPUT_CHARS);
  assert.doesNotMatch(digest.text, /FULL PAGE DUMP FULL PAGE DUMP/);
  assert.equal(digest.evaluatedCount, 15);
});

test('rankSearchCandidatesWithDecision1 reranks, prunes spam, and selects top fetch URLs', async () => {
  resetDecisionLimiterForTests();
  let decisionCalls = 0;

  const mockDecisionFetch = async (url, init) => {
    decisionCalls += 1;
    assert.ok(url.startsWith(DECISIONS_ENDPOINT));
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'gemini-decision-1');
    assert.ok(body.input.length <= MAX_DECISION_INPUT_CHARS);
    assert.ok(body.questions.s_0 && body.questions.s_1 && body.questions.s_2 && body.questions.s_3);
    assert.ok(body.questions.best_primary);

    return new Response(
      JSON.stringify({
        answers: {
          s_0: { score: 0.25, confidence: 0.92 },
          s_1: { score: 3.88, confidence: 0.96 },
          s_2: { score: 2.9, confidence: 0.8 },
          s_3: { score: 0.1, confidence: 0.98 },
          best_primary: { choice: '1', confidence: 0.95 }
        },
        usage: { total_input_tokens: 410, total_output_tokens: 0 }
      }),
      { status: 200 }
    );
  };

  const candidates = [
    { site: 'w3.org', title: '1999 archive', url: 'https://w3.org/1999', snippet: 'Old unrelated archive.' },
    { site: 'nodejs.org', title: 'Node.js 22 Release', url: 'https://nodejs.org/22', snippet: 'Official changelog.' },
    { site: 'lwn.net', title: 'Node.js security note', url: 'https://lwn.net/node', snippet: 'Technical breakdown.' },
    { site: 'spam.example', title: 'Buy hats', url: 'https://spam.example', snippet: 'Cheap hats sale.' }
  ];

  const ranked = await rankSearchCandidatesWithDecision1(candidates, {
    query: 'Node.js 22 changelog',
    apiKey: 'test-key',
    fetchTop: 2,
    fetchImpl: mockDecisionFetch
  });

  assert.equal(decisionCalls, 1);
  assert.equal(ranked.usedDecisionApi, true);
  assert.equal(ranked.items[0].site, 'nodejs.org');
  assert.equal(ranked.items[1].site, 'lwn.net');
  assert.equal(ranked.items.length, 3);
  assert.deepEqual(ranked.fetchCandidateIndices, [0, 1]);
});

test('rankSearchCandidatesWithDecision1 skips API cleanly when fewer than 3 candidates or missing key', async () => {
  resetDecisionLimiterForTests();
  let called = false;
  const result = await rankSearchCandidatesWithDecision1(
    [
      { site: 'a.example', title: 'A', url: 'https://a.example' },
      { site: 'b.example', title: 'B', url: 'https://b.example' }
    ],
    {
      query: 'test',
      apiKey: 'test-key',
      fetchTop: 1,
      fetchImpl: async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }
    }
  );

  assert.equal(called, false);
  assert.equal(result.usedDecisionApi, false);
  assert.deepEqual(result.fetchCandidateIndices, [0]);
});

test('distillToolPayloadContent strips boilerplate from standalone fetch results', () => {
  const distilled = distillToolPayloadContent(
    {
      ok: true,
      title: 'Aarhus Guide',
      content: 'Accept all cookies\n\nAarhus is the second-largest city in Denmark.\n\nPrivacy Policy'
    },
    'Aarhus Denmark'
  );
  assert.equal(distilled.content, 'Aarhus is the second-largest city in Denmark.');
});
