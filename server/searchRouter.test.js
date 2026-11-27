import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SearchRouterState,
  createInMemoryCoordinator,
  createTurnSearchBudget,
  executeSearchBatch,
  fetchAllServerStats,
  parseServerStatsPayload,
  resolveMediaSources
} from './searchRouter.js';

function makeStatsPayload({ readyWeb = [], coolingWeb = [], readyTier2 = ['wikipedia'] } = {}) {
  return {
    engines: [
      ...readyWeb.map((name) => ({
        name,
        tier: 1,
        status: 'ready',
        cooldown_remaining_sec: 0,
        consecutive_failures: 0
      })),
      ...coolingWeb.map((name) => ({
        name,
        tier: 1,
        status: 'cooldown',
        cooldown_remaining_sec: 18,
        consecutive_failures: 0
      })),
      ...readyTier2.map((name) => ({
        name,
        tier: 2,
        status: 'ready',
        cooldown_remaining_sec: 0,
        consecutive_failures: 0
      })),
      { name: 'github', tier: 3, status: 'ready', cooldown_remaining_sec: 0, consecutive_failures: 0 }
    ]
  };
}

test('parses Tier-1 web readiness separately from Tier-2/3 counts', () => {
  const parsed = parseServerStatsPayload(
    makeStatsPayload({ readyWeb: ['bing', 'google'], coolingWeb: ['yahoo'] })
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.readyTier1Engines, ['bing', 'google']);
  assert.deepEqual(parsed.readyTier2Engines, ['wikipedia']);
  assert.equal(parsed.tier1Engines.length, 3);
});

test('fills primary server first and spills overflow web and media calls to secondary server', async () => {
  const servers = ['https://s1.example', 'https://s2.example'];
  const state = new SearchRouterState({ servers, rng: () => 0.5 });
  const coordinator = createInMemoryCoordinator(state);
  const requests = [];

  const mockFetch = async (url, init) => {
    requests.push({ url, headers: init?.headers || {} });
    const parsedUrl = new URL(url);
    const origin = parsedUrl.origin;

    if (parsedUrl.pathname === '/stats') {
      const payload =
        origin === 'https://s1.example'
          ? makeStatsPayload({ readyWeb: ['bing', 'google'] })
          : makeStatsPayload({ readyWeb: ['startpage', 'yahoo', 'yandex', 'wiby'] });
      return new Response(JSON.stringify(payload), { status: 200 });
    }

    if (parsedUrl.pathname === '/api/search') {
      return new Response(
        JSON.stringify({
          query: parsedUrl.searchParams.get('q'),
          category: 'web',
          engines_used: ['bing'],
          engines_tried: ['bing'],
          results: [
            {
              title: `Result for ${parsedUrl.searchParams.get('q')}`,
              url: `https://example.org/${encodeURIComponent(parsedUrl.searchParams.get('q'))}`,
              snippet: 'Short summary',
              engines: ['bing']
            }
          ]
        }),
        { status: 200 }
      );
    }

    if (parsedUrl.pathname === '/api/media') {
      const sources = (parsedUrl.searchParams.get('sources') || '').split(',');
      return new Response(
        JSON.stringify({
          query: parsedUrl.searchParams.get('q'),
          sources_used: sources,
          source_counts: Object.fromEntries(sources.map((s) => [s, 1])),
          results: sources.map((src) => ({
            title: `${src} hit`,
            url: `https://${src}.example.com/item`,
            snippet: 'Media snippet',
            source: src,
            engines: [src]
          }))
        }),
        { status: 200 }
      );
    }

    return new Response('{}', { status: 404 });
  };

  const budget = createTurnSearchBudget();
  const batchCalls = [
    { name: 'web_search', args: { query: 'q1' } },
    { name: 'web_search', args: { query: 'q2' } },
    { name: 'web_search', args: { query: 'q3' } },
    { name: 'web_search', args: { query: 'q4' } },
    { name: 'media_search', args: { query: 'm1', sources: 'github' } },
    { name: 'media_search', args: { query: 'm2', sources: 'github' } }
  ];

  const results = await executeSearchBatch(batchCalls, budget, {
    servers,
    coordinator,
    fetchImpl: mockFetch,
    maxCooldownWaitMs: 0
  });

  // Exactly 2 /stats probes before routing the batch
  const statsCalls = requests.filter((r) => new URL(r.url).pathname === '/stats');
  assert.equal(statsCalls.length, 2);

  // First 2 web queries went to s1, next 2 spilled onto s2
  assert.equal(results[0].server_used, 'https://s1.example');
  assert.equal(results[1].server_used, 'https://s1.example');
  assert.equal(results[2].server_used, 'https://s2.example');
  assert.equal(results[3].server_used, 'https://s2.example');
  assert.equal(results[0].results[0].site, 'example.org');

  // Same media source (github) ran on s1 first and spilled second call onto s2
  assert.equal(results[4].server_used, 'https://s1.example');
  assert.equal(results[5].server_used, 'https://s2.example');

  // X-Router-Peer-Hop: 1 is attached so upstream servers do not double-forward
  const searchReqs = requests.filter((r) => new URL(r.url).pathname === '/api/search');
  assert.equal(searchReqs.every((r) => r.headers['X-Router-Peer-Hop'] === '1'), true);
});

test('enforces randomized 20-30s cooldown per engine and media source across calls', async () => {
  const servers = ['https://s1.example', 'https://s2.example'];
  const state = new SearchRouterState({
    servers,
    cooldownMinMs: 20_000,
    cooldownMaxMs: 30_000,
    rng: () => 0.4 // 24s cooldown
  });

  const statsByUrl = {
    'https://s1.example': parseServerStatsPayload(makeStatsPayload({ readyWeb: ['bing'] })),
    'https://s2.example': parseServerStatsPayload(makeStatsPayload({ readyWeb: ['google'] }))
  };

  const t0 = 1_000_000;
  const firstPlan = state.reserveBatch(
    {
      servers,
      jobs: [
        { id: 0, kind: 'web', sources: [] },
        { id: 1, kind: 'media', sources: ['github'], isPreset: false }
      ],
      statsByUrl
    },
    t0
  );

  assert.equal(firstPlan.assignments[0].serverUrl, 'https://s1.example');
  assert.equal(firstPlan.assignments[1].serverUrl, 'https://s1.example');

  state.releaseBatch(
    firstPlan.assignments.map((a) => ({
      reservationId: a.reservationId,
      kind: a.kind,
      serverUrl: a.serverUrl,
      engineName: a.engineName,
      mediaSources: a.mediaSources
    })),
    t0 + 500
  );

  // At t0 + 10s (still within 24s cooldown), s1 is skipped; both spill to s2!
  const secondPlan = state.reserveBatch(
    {
      servers,
      jobs: [
        { id: 0, kind: 'web', sources: [] },
        { id: 1, kind: 'media', sources: ['github'], isPreset: false }
      ],
      statsByUrl
    },
    t0 + 10_000
  );

  assert.equal(secondPlan.assignments[0].serverUrl, 'https://s2.example');
  assert.equal(secondPlan.assignments[1].serverUrl, 'https://s2.example');

  state.releaseBatch(
    secondPlan.assignments.map((a) => ({
      reservationId: a.reservationId,
      kind: a.kind,
      serverUrl: a.serverUrl,
      engineName: a.engineName,
      mediaSources: a.mediaSources
    })),
    t0 + 10_200
  );

  // At t0 + 15s both s1 and s2 are still inside 24s cooldown
  const thirdPlan = state.reserveBatch(
    {
      servers,
      jobs: [{ id: 0, kind: 'web', sources: [] }],
      statsByUrl
    },
    t0 + 15_000
  );

  assert.equal(thirdPlan.assignments[0].status, 'cooldown');
  assert.ok(thirdPlan.assignments[0].waitMs > 5_000);

  // After 25s from t0+500, s1 is ready again
  const fourthPlan = state.reserveBatch(
    {
      servers,
      jobs: [{ id: 0, kind: 'web', sources: [] }],
      statsByUrl
    },
    t0 + 26_000
  );
  assert.equal(fourthPlan.assignments[0].status, 'assigned');
  assert.equal(fourthPlan.assignments[0].serverUrl, 'https://s1.example');
});

test('caps web_search and media_search at 6 distinct queries per message', async () => {
  const servers = ['https://s1.example'];
  const state = new SearchRouterState({ servers });
  const coordinator = createInMemoryCoordinator(state);
  const budget = createTurnSearchBudget();

  const mockFetch = async (url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname === '/stats') {
      return new Response(
        JSON.stringify(
          makeStatsPayload({
            readyWeb: ['bing', 'google', 'startpage', 'yahoo', 'yandex', 'wiby', 'mwmbl', 'fynd']
          })
        ),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({ query: 'ok', engines_used: ['bing'], results: [] }),
      { status: 200 }
    );
  };

  const calls = Array.from({ length: 8 }, (_, idx) => ({
    name: 'web_search',
    args: { query: `query-${idx + 1}` }
  }));

  const results = await executeSearchBatch(calls, budget, {
    servers,
    coordinator,
    fetchImpl: mockFetch,
    maxCooldownWaitMs: 0
  });

  assert.equal(results.slice(0, 6).every((r) => r.ok === true), true);
  assert.equal(results[6].limit_reached, true);
  assert.equal(results[7].limit_reached, true);
  assert.equal(budget.webUsed, 6);
});

test('expands media presets and aliases cleanly', () => {
  assert.deepEqual(resolveMediaSources('hn,so,wiki,dev.to'), [
    'hackernews',
    'stackoverflow',
    'wikipedia',
    'devto'
  ]);
  assert.equal(resolveMediaSources('news').includes('wikinews'), true);
});

test('fetchAllServerStats returns within grace window when one server is cold-starting', async () => {
  const fastStats = makeStatsPayload({ readyWeb: ['bing', 'google'] });
  const mockFetch = async (url, init) => {
    const parsed = new URL(url);
    if (parsed.origin === 'https://fast.example') {
      return new Response(JSON.stringify(fastStats), { status: 200 });
    }
    return new Promise((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  };

  const t0 = performance.now();
  const res = await fetchAllServerStats(['https://fast.example', 'https://slow.example'], {
    fetchImpl: mockFetch,
    timeoutMs: 2_000,
    graceAfterFirstOkMs: 40
  });
  const elapsed = performance.now() - t0;

  assert.equal(res['https://fast.example'].ok, true);
  assert.equal(res['https://slow.example'].ok, false);
  assert.ok(elapsed < 400);
});

test('news_search queries upstream /api/news with sources=all', async () => {
  const servers = ['https://s1.example'];
  const state = new SearchRouterState({ servers });
  const requestedPaths = [];

  const mockFetch = async (url) => {
    const parsed = new URL(url);
    requestedPaths.push(`${parsed.pathname}${parsed.search}`);
    if (parsed.pathname === '/stats') {
      return new Response(JSON.stringify(makeStatsPayload({ readyWeb: ['bing'] })), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        query: 'AI',
        mode: 'search',
        sources_used: ['rss_news'],
        results: [{ title: 'AI Update', url: 'https://news.example.com/1', snippet: 'Latest', engines: ['rss'] }]
      }),
      { status: 200 }
    );
  };

  const results = await executeSearchBatch(
    [{ name: 'news_search', args: { query: 'AI', lang: 'en', limit: 5 } }],
    createTurnSearchBudget(),
    { servers, coordinator: createInMemoryCoordinator(state), fetchImpl: mockFetch, maxCooldownWaitMs: 0 }
  );

  assert.equal(results[0].ok, true);
  assert.equal(results[0].results.length, 1);
  assert.equal(requestedPaths.some((p) => p.includes('/api/news?') && p.includes('sources=all')), true);
});

test('reports cooldown=true and retry_after_sec when all servers are in 20-30s cooldown', async () => {
  const servers = ['https://s1.example'];
  const state = new SearchRouterState({ servers, cooldownMinMs: 20_000, cooldownMaxMs: 30_000, rng: () => 0.5 });
  const coordinator = createInMemoryCoordinator(state);
  const mockFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/stats') {
      return new Response(JSON.stringify(makeStatsPayload({ readyWeb: ['bing'] })), { status: 200 });
    }
    return new Response(
      JSON.stringify({ query: 'test', sources_used: ['github'], source_counts: { github: 1 }, results: [] }),
      { status: 200 }
    );
  };

  const results = await executeSearchBatch(
    [
      { name: 'media_search', args: { query: 'one', sources: 'github' } },
      { name: 'media_search', args: { query: 'two', sources: 'github' } }
    ],
    createTurnSearchBudget(),
    { servers, coordinator, fetchImpl: mockFetch, maxCooldownWaitMs: 0 }
  );

  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[1].cooldown, true);
  assert.ok(results[1].retry_after_sec >= 15);
});

test('enforces cumulative 6 web and 6 media cap across multiple search-and-analyze rounds', async () => {
  const servers = ['https://s1.example', 'https://s2.example'];
  const state = new SearchRouterState({ servers, cooldownMinMs: 0, cooldownMaxMs: 0 });
  const coordinator = createInMemoryCoordinator(state);
  const budget = createTurnSearchBudget();

  const mockFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/stats') {
      return new Response(
        JSON.stringify(
          makeStatsPayload({
            readyWeb: ['bing', 'google', 'startpage', 'yahoo', 'yandex', 'wiby']
          })
        ),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({ query: 'ok', engines_used: ['bing'], sources_used: ['github'], results: [] }),
      { status: 200 }
    );
  };

  const round1 = await executeSearchBatch(
    [
      { name: 'web_search', args: { query: 'w1' } },
      { name: 'web_search', args: { query: 'w2' } },
      { name: 'web_search', args: { query: 'w3' } },
      { name: 'web_search', args: { query: 'w4' } },
      { name: 'media_search', args: { query: 'm1', sources: 'github' } },
      { name: 'media_search', args: { query: 'm2', sources: 'reddit' } },
      { name: 'media_search', args: { query: 'm3', sources: 'wikinews' } }
    ],
    budget,
    { servers, coordinator, fetchImpl: mockFetch, maxCooldownWaitMs: 0 }
  );

  assert.equal(round1.every((r) => r.ok === true), true);
  assert.deepEqual(round1[0].budget_remaining, { web_search: 2, media_search: 3 });

  const round2 = await executeSearchBatch(
    [
      { name: 'web_search', args: { query: 'w5' } },
      { name: 'web_search', args: { query: 'w6' } },
      { name: 'web_search', args: { query: 'w7-over' } },
      { name: 'media_search', args: { query: 'm4', sources: 'hackernews' } },
      { name: 'media_search', args: { query: 'm5', sources: 'stackoverflow' } },
      { name: 'media_search', args: { query: 'm6', sources: 'wikipedia' } },
      { name: 'media_search', args: { query: 'm7-over', sources: 'arxiv' } }
    ],
    budget,
    { servers, coordinator, fetchImpl: mockFetch, maxCooldownWaitMs: 0 }
  );

  assert.equal(round2[0].ok, true);
  assert.equal(round2[1].ok, true);
  assert.equal(round2[2].limit_reached, true);
  assert.equal(round2[3].ok, true);
  assert.equal(round2[4].ok, true);
  assert.equal(round2[5].ok, true);
  assert.equal(round2[6].limit_reached, true);
  assert.deepEqual(round2[6].budget_remaining, { web_search: 0, media_search: 0 });
  assert.equal(budget.webUsed, 6);
  assert.equal(budget.mediaUsed, 6);
});

test('allows AI-requested result limits up to 15 and clamps larger limits to 15', async () => {
  const servers = ['https://s1.example', 'https://s2.example'];
  const state = new SearchRouterState({ servers, cooldownMinMs: 0, cooldownMaxMs: 0 });
  const coordinator = createInMemoryCoordinator(state);
  const forwardedRequests = [];

  const mockFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/stats') {
      return new Response(
        JSON.stringify(makeStatsPayload({ readyWeb: ['bing', 'google'], readyDomains: { github: true } })),
        { status: 200 }
      );
    }
    forwardedRequests.push({
      path: parsed.pathname,
      limit: Number(parsed.searchParams.get('limit'))
    });
    const fakeItems = Array.from({ length: 24 }, (_, idx) => ({
      url: `https://github.com/org/repo-${idx}`,
      title: `Result ${idx}`,
      snippet: `Snippet ${idx}`
    }));
    if (parsed.pathname === '/api/research') {
      return new Response(
        JSON.stringify({
          query: 'ok',
          web: { engines_used: ['bing'], results: fakeItems },
          facts: { lang: 'en', wikipedia: fakeItems, wikidata: fakeItems },
          news: { sources_used: ['wikinews'], results: fakeItems }
        }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({ query: 'ok', engines_used: ['bing'], sources_used: ['github'], results: fakeItems }),
      { status: 200 }
    );
  };

  const results = await executeSearchBatch(
    [
      { name: 'web_search', args: { query: 'custom 12', limit: 12 } },
      { name: 'media_search', args: { query: 'over cap', sources: 'github', limit: 99 } },
      { name: 'research_topic', args: { query: 'topic cap', limit: 40 } }
    ],
    createTurnSearchBudget(),
    { servers, coordinator, fetchImpl: mockFetch, maxCooldownWaitMs: 0 }
  );

  assert.equal(results.every((r) => r.ok === true), true);
  assert.equal(forwardedRequests[0].limit, 12);
  assert.equal(results[0].results.length, 12);
  assert.equal(results[1].results.length, 15);
  assert.equal(forwardedRequests[2].limit, 15);
  assert.equal(results[2].web.results.length, 15);
  assert.equal(results[2].facts.wikipedia.length, 15);
  assert.equal(results[2].news.results.length, 15);
});

test('uses gemini-decision-1 to select best URL for selective fetch_top without sending full pages to decision API', async () => {
  const servers = ['https://s1.example', 'https://s2.example'];
  const state = new SearchRouterState({ servers, cooldownMinMs: 0, cooldownMaxMs: 0 });
  const coordinator = createInMemoryCoordinator(state);
  const fetchedUrls = [];
  let searchUrlCalled = '';

  const mockSearchFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/stats') {
      return new Response(JSON.stringify(makeStatsPayload({ readyWeb: ['bing'] })), { status: 200 });
    }
    if (parsed.pathname === '/api/search') {
      searchUrlCalled = url;
      return new Response(
        JSON.stringify({
          query: 'Node.js 22',
          engines_used: ['bing'],
          results: [
            { site: 'junk.example', title: 'Buy mugs', url: 'https://junk.example/mugs', snippet: 'Shopping deal.' },
            { site: 'nodejs.org', title: 'Node.js 22 Release Notes', url: 'https://nodejs.org/en/blog/release/v22', snippet: 'Official V8 12.4 and WebSocket release notes.' },
            { site: 'blog.example', title: 'Random link roundup', url: 'https://blog.example/links', snippet: 'Weekly bookmarks.' }
          ]
        }),
        { status: 200 }
      );
    }
    if (parsed.pathname === '/api/fetch') {
      fetchedUrls.push(parsed.searchParams.get('url'));
      return new Response(
        JSON.stringify({
          ok: true,
          url: parsed.searchParams.get('url'),
          content: 'Skip to main content\n\nNode.js 22 brings V8 12.4 and built-in WebSocket client.\n\nPrivacy Policy'
        }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  };

  const mockDecisionFetch = async (_url, init) => {
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.model, 'gemini-decision-1');
    return new Response(
      JSON.stringify({
        answers: {
          s_0: { score: 0.2, confidence: 0.9 },
          s_1: { score: 3.9, confidence: 0.96 },
          s_2: { score: 1.5, confidence: 0.7 },
          best_primary: { choice: '1', confidence: 0.95 }
        },
        usage: { total_input_tokens: 340, total_output_tokens: 0 }
      }),
      { status: 200 }
    );
  };

  const results = await executeSearchBatch(
    [{ name: 'web_search', args: { query: 'Node.js 22', fetch_top: 1, limit: 5 } }],
    createTurnSearchBudget(),
    {
      servers,
      coordinator,
      fetchImpl: mockSearchFetch,
      decisionApiKey: 'test-decision-key',
      decisionFetchImpl: mockDecisionFetch,
      maxCooldownWaitMs: 0
    }
  );

  assert.equal(new URL(searchUrlCalled).searchParams.get('fetch_top'), '0');
  assert.equal(results[0].ok, true);
  assert.equal(results[0].decision_filtered, true);
  assert.deepEqual(fetchedUrls, ['https://nodejs.org/en/blog/release/v22']);
  assert.equal(results[0].results[0].site, 'nodejs.org');
  assert.equal(results[0].results[0].content, 'Node.js 22 brings V8 12.4 and built-in WebSocket client.');
});
