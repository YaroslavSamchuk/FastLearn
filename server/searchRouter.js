// language: JavaScript, file: server/searchRouter.js, target: Node.js & Cloudflare Workers

import {
  MAX_FETCH_TOP_CONTENT_CHARS,
  distillToolPayloadContent,
  extractMainContentExcerpt,
  rankSearchCandidatesWithDecision1
} from './decisionRouter.js';

export const DEFAULT_SEARCH_SERVERS = [
  'https://search-swzb.onrender.com',
  'https://search-dhne.onrender.com'
];

export const MAX_WEB_SEARCHES_PER_MESSAGE = 6;
export const MAX_MEDIA_SEARCHES_PER_MESSAGE = 6;
export const MAX_AUX_SEARCHES_PER_MESSAGE = 8;
export const MAX_RESULTS_PER_QUERY = 15;

export const DEFAULT_COOLDOWN_MIN_MS = 20_000;
export const DEFAULT_COOLDOWN_MAX_MS = 30_000;
export const DEFAULT_STATS_TIMEOUT_MS = 12_000;
export const DEFAULT_STATS_GRACE_MS = 2_500;
export const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
export const DEFAULT_MAX_COOLDOWN_WAIT_MS = 6_000;
export const DEFAULT_SERVER_BACKOFF_MS = 15_000;
export const PREWARM_INTERVAL_MS = 4 * 60 * 1000;

export const SEARCH_TOOL_NAMES = new Set([
  'web_search',
  'media_search',
  'wiki_search',
  'wiki_page',
  'news_search',
  'fetch_url',
  'research_topic'
]);

export const MEDIA_PRESETS = {
  all: [
    'reddit',
    'github',
    'wikinews',
    'news',
    'hackernews',
    'stackoverflow',
    'lemmy',
    'wikipedia'
  ],
  news: ['wikinews', 'news'],
  social: ['reddit', 'hackernews', 'lemmy'],
  dev: ['github', 'stackoverflow', 'hackernews', 'devto', 'npm', 'huggingface', 'arxiv'],
  knowledge: ['wikipedia', 'arxiv']
};

export const MEDIA_ALIASES = {
  hn: 'hackernews',
  so: 'stackoverflow',
  hf: 'huggingface',
  wiki: 'wikipedia',
  rss: 'news',
  'dev.to': 'devto'
};

export const KNOWN_MEDIA_SOURCES = new Set([
  'reddit',
  'github',
  'wikinews',
  'news',
  'hackernews',
  'stackoverflow',
  'lemmy',
  'huggingface',
  'arxiv',
  'npm',
  'devto',
  'wikipedia'
]);

/**
 * Parse comma-separated SearXNG router URLs with safe defaults.
 */
export function parseSearchServers(rawUrls) {
  if (typeof rawUrls !== 'string' || !rawUrls.trim()) {
    return [...DEFAULT_SEARCH_SERVERS];
  }
  const seen = new Set();
  const parsed = [];
  for (const item of rawUrls.split(',')) {
    const cleaned = item.trim().replace(/\/+$/, '');
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    parsed.push(cleaned);
  }
  return parsed.length > 0 ? parsed : [...DEFAULT_SEARCH_SERVERS];
}

/**
 * Expand presets and aliases into a deduplicated list of supported media platforms.
 */
export function resolveMediaSources(rawSources) {
  const tokens = Array.isArray(rawSources)
    ? rawSources.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)
    : String(rawSources || 'all')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

  const inputTokens = tokens.length > 0 ? tokens : ['all'];
  const resolved = [];
  const seen = new Set();

  for (const token of inputTokens) {
    const expansion = MEDIA_PRESETS[token];
    if (expansion) {
      for (const source of expansion) {
        if (!seen.has(source)) {
          seen.add(source);
          resolved.push(source);
        }
      }
      continue;
    }

    const canonical = MEDIA_ALIASES[token] || token;
    if (KNOWN_MEDIA_SOURCES.has(canonical) && !seen.has(canonical)) {
      seen.add(canonical);
      resolved.push(canonical);
    }
  }

  return resolved.length > 0 ? resolved : [...MEDIA_PRESETS.all];
}

/**
 * Extract a clean hostname (without www.) for concise source attribution.
 */
export function extractSiteHost(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

/**
 * Track per-message tool limits across multiple Gemini tool-calling rounds.
 */
export function createTurnSearchBudget({
  maxWeb = MAX_WEB_SEARCHES_PER_MESSAGE,
  maxMedia = MAX_MEDIA_SEARCHES_PER_MESSAGE,
  maxAux = MAX_AUX_SEARCHES_PER_MESSAGE
} = {}) {
  return {
    maxWeb,
    maxMedia,
    maxAux,
    webUsed: 0,
    mediaUsed: 0,
    auxUsed: 0
  };
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function cleanString(value, maxChars = 400) {
  return typeof value === 'string' ? value.trim().slice(0, maxChars) : '';
}

function createServerRecord(url) {
  return {
    url,
    serverBackoffUntil: 0,
    engines: new Map(),
    mediaSources: new Map(),
    auxInFlight: 0
  };
}

function getBucket(map, key) {
  let entry = map.get(key);
  if (!entry) {
    entry = { inFlight: 0, cooldownUntil: 0, lastUsedAt: 0 };
    map.set(key, entry);
  }
  return entry;
}

/**
 * Stateful per-server scheduler enforcing 20-30s randomized cooldowns per engine & media source,
 * plus overflow routing from primary server to secondary server.
 */
export class SearchRouterState {
  constructor({
    servers = DEFAULT_SEARCH_SERVERS,
    cooldownMinMs = DEFAULT_COOLDOWN_MIN_MS,
    cooldownMaxMs = DEFAULT_COOLDOWN_MAX_MS,
    serverBackoffMs = DEFAULT_SERVER_BACKOFF_MS,
    rng = Math.random
  } = {}) {
    this.cooldownMinMs = cooldownMinMs;
    this.cooldownMaxMs = Math.max(cooldownMinMs, cooldownMaxMs);
    this.serverBackoffMs = serverBackoffMs;
    this.rng = rng;
    this.serverUrls = [];
    this.servers = new Map();
    this._reservationSeq = 0;
    this.syncServers(servers);
  }

  syncServers(serverUrls) {
    const nextUrls = parseSearchServers(Array.isArray(serverUrls) ? serverUrls.join(',') : serverUrls);
    const nextMap = new Map();
    for (const url of nextUrls) {
      nextMap.set(url, this.servers.get(url) || createServerRecord(url));
    }
    this.serverUrls = nextUrls;
    this.servers = nextMap;
  }

  _nextCooldownMs() {
    if (this.cooldownMaxMs <= this.cooldownMinMs) return this.cooldownMinMs;
    return Math.round(
      this.cooldownMinMs + this.rng() * (this.cooldownMaxMs - this.cooldownMinMs)
    );
  }

  _isServerUp(record, snapshot, now) {
    if (!record) return false;
    if (now < record.serverBackoffUntil) return false;
    if (snapshot && snapshot.ok === false) return false;
    return true;
  }

  _pickWebSlot(record, snapshot, now) {
    if (!this._isServerUp(record, snapshot, now)) return null;

    const remoteTier1 = snapshot?.readyTier1Engines ?? [];
    const candidates = [];

    for (const engineName of remoteTier1) {
      const bucket = getBucket(record.engines, engineName);
      if (bucket.inFlight > 0) continue;
      if (now < bucket.cooldownUntil) continue;
      candidates.push({ engineName, bucket, tier: 1 });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.bucket.lastUsedAt - b.bucket.lastUsedAt);
      return candidates[0];
    }

    return null;
  }

  _soonestWebWaitMs(snapshotsByUrl, now) {
    let soonest = Infinity;
    for (const url of this.serverUrls) {
      const record = this.servers.get(url);
      const snap = snapshotsByUrl.get(url);
      if (!record) continue;

      if (now < record.serverBackoffUntil) {
        soonest = Math.min(soonest, record.serverBackoffUntil - now);
        continue;
      }
      if (snap?.ok === false) continue;

      for (const engine of snap?.tier1Engines ?? []) {
        const local = record.engines.get(engine.name);
        if (local && local.inFlight > 0) continue;
        const localRemaining = local ? Math.max(0, local.cooldownUntil - now) : 0;
        const remoteRemaining = Math.max(0, Number(engine.cooldownRemainingMs) || 0);
        const waitMs = Math.max(localRemaining, remoteRemaining);
        if (waitMs > 0) soonest = Math.min(soonest, waitMs);
      }
    }
    return Number.isFinite(soonest) ? soonest : null;
  }

  _pickMediaSourcesOnServer(record, snapshot, requestedSources, isPreset, now) {
    if (!this._isServerUp(record, snapshot, now)) return null;

    const readySources = [];
    for (const source of requestedSources) {
      const bucket = getBucket(record.mediaSources, source);
      if (bucket.inFlight > 0 || now < bucket.cooldownUntil) {
        if (!isPreset) return null;
        continue;
      }
      if (source === 'reddit') {
        const webSlot = this._pickWebSlot(record, snapshot, now);
        if (!webSlot) {
          if (!isPreset) return null;
          continue;
        }
      }
      readySources.push(source);
    }

    if (readySources.length === 0) return null;
    return readySources;
  }

  _soonestMediaWaitMs(requestedSources, snapshotsByUrl, now) {
    let soonest = Infinity;
    for (const url of this.serverUrls) {
      const record = this.servers.get(url);
      const snap = snapshotsByUrl.get(url);
      if (!record || snap?.ok === false) continue;
      if (now < record.serverBackoffUntil) {
        soonest = Math.min(soonest, record.serverBackoffUntil - now);
        continue;
      }

      let serverWait = 0;
      let blocked = false;
      for (const source of requestedSources) {
        const bucket = record.mediaSources.get(source);
        if (bucket && bucket.inFlight > 0) {
          blocked = true;
          break;
        }
        const sourceWait = bucket ? Math.max(0, bucket.cooldownUntil - now) : 0;
        serverWait = Math.max(serverWait, sourceWait);
        if (source === 'reddit') {
          const webSlot = this._pickWebSlot(record, snap, now);
          if (!webSlot) {
            const webWait = this._soonestWebWaitMs(new Map([[url, snap]]), now);
            if (webWait === null) {
              blocked = true;
              break;
            }
            serverWait = Math.max(serverWait, webWait);
          }
        }
      }
      if (!blocked && serverWait > 0) {
        soonest = Math.min(soonest, serverWait);
      }
    }
    return Number.isFinite(soonest) ? soonest : null;
  }

  /**
   * Atomically reserve server capacity for a batch of search jobs.
   * Server 0 receives everything that fits; overflow spills onto Server 1 (and further servers).
   */
  reserveBatch({ servers: serverUrls, jobs, statsByUrl = {} }, now = Date.now()) {
    if (Array.isArray(serverUrls) && serverUrls.length > 0) {
      this.syncServers(serverUrls);
    }

    const snapshotsByUrl = new Map();
    for (const url of this.serverUrls) {
      snapshotsByUrl.set(url, statsByUrl[url] || null);
    }

    const assignments = [];

    for (const job of jobs) {
      const reservationId = `res_${++this._reservationSeq}`;

      if (job.kind === 'web') {
        let chosen = null;
        for (let serverIndex = 0; serverIndex < this.serverUrls.length; serverIndex += 1) {
          const url = this.serverUrls[serverIndex];
          const record = this.servers.get(url);
          const snap = snapshotsByUrl.get(url);
          const slot = this._pickWebSlot(record, snap, now);
          if (slot) {
            slot.bucket.inFlight += 1;
            slot.bucket.lastUsedAt = now;
            chosen = {
              id: job.id,
              reservationId,
              status: 'assigned',
              kind: 'web',
              serverIndex,
              serverUrl: url,
              engineName: slot.engineName,
              mediaSources: []
            };
            break;
          }
        }

        if (chosen) {
          assignments.push(chosen);
        } else {
          const waitMs = this._soonestWebWaitMs(snapshotsByUrl, now);
          assignments.push({
            id: job.id,
            reservationId: null,
            status: 'cooldown',
            kind: 'web',
            waitMs
          });
        }
        continue;
      }

      if (job.kind === 'media') {
        const requested = Array.isArray(job.sources) && job.sources.length > 0
          ? job.sources
          : MEDIA_PRESETS.all;
        const isPreset = Boolean(job.isPreset);
        let best = null;

        for (let serverIndex = 0; serverIndex < this.serverUrls.length; serverIndex += 1) {
          const url = this.serverUrls[serverIndex];
          const record = this.servers.get(url);
          const snap = snapshotsByUrl.get(url);
          const readySubset = this._pickMediaSourcesOnServer(
            record,
            snap,
            requested,
            isPreset,
            now
          );
          if (!readySubset) continue;

          // Prefer first server (serverIndex 0) whenever ALL requested sources fit there.
          if (readySubset.length === requested.length) {
            best = { serverIndex, url, record, snap, activeSources: readySubset };
            break;
          }
          if (!best || readySubset.length > best.activeSources.length) {
            best = { serverIndex, url, record, snap, activeSources: readySubset };
          }
        }

        if (best) {
          let reservedWebEngine = null;
          if (best.activeSources.includes('reddit')) {
            const webSlot = this._pickWebSlot(best.record, best.snap, now);
            if (webSlot) {
              webSlot.bucket.inFlight += 1;
              webSlot.bucket.lastUsedAt = now;
              reservedWebEngine = webSlot.engineName;
            }
          }
          for (const source of best.activeSources) {
            const bucket = getBucket(best.record.mediaSources, source);
            bucket.inFlight += 1;
            bucket.lastUsedAt = now;
          }
          assignments.push({
            id: job.id,
            reservationId,
            status: 'assigned',
            kind: 'media',
            serverIndex: best.serverIndex,
            serverUrl: best.url,
            engineName: reservedWebEngine,
            mediaSources: best.activeSources
          });
        } else {
          const waitMs = this._soonestMediaWaitMs(requested, snapshotsByUrl, now);
          assignments.push({
            id: job.id,
            reservationId: null,
            status: 'cooldown',
            kind: 'media',
            waitMs
          });
        }
        continue;
      }

      // Auxiliary direct tools (wiki_search, wiki_page, fetch_url): pick healthy server with fewest in-flight.
      let bestAux = null;
      for (let serverIndex = 0; serverIndex < this.serverUrls.length; serverIndex += 1) {
        const url = this.serverUrls[serverIndex];
        const record = this.servers.get(url);
        const snap = snapshotsByUrl.get(url);
        if (!this._isServerUp(record, snap, now)) continue;
        if (!bestAux || record.auxInFlight < bestAux.record.auxInFlight) {
          bestAux = { serverIndex, url, record };
        }
      }

      if (bestAux) {
        bestAux.record.auxInFlight += 1;
        assignments.push({
          id: job.id,
          reservationId,
          status: 'assigned',
          kind: 'aux',
          serverIndex: bestAux.serverIndex,
          serverUrl: bestAux.url,
          engineName: null,
          mediaSources: []
        });
      } else {
        assignments.push({
          id: job.id,
          reservationId: null,
          status: 'unavailable',
          kind: 'aux',
          waitMs: null
        });
      }
    }

    return { assignments };
  }

  /**
   * Release reserved slots and apply randomized 20-30s cooldowns per used engine & media source.
   */
  releaseBatch(releases, now = Date.now()) {
    for (const rel of releases) {
      const record = this.servers.get(rel.serverUrl);
      if (!record) continue;

      if (rel.kind === 'aux') {
        record.auxInFlight = Math.max(0, record.auxInFlight - 1);
      }

      if (rel.engineName) {
        const bucket = getBucket(record.engines, rel.engineName);
        bucket.inFlight = Math.max(0, bucket.inFlight - 1);
        bucket.cooldownUntil = Math.max(bucket.cooldownUntil, now + this._nextCooldownMs());
      }

      for (const eng of rel.additionalEngines || []) {
        const bucket = getBucket(record.engines, eng);
        bucket.cooldownUntil = Math.max(bucket.cooldownUntil, now + this._nextCooldownMs());
      }

      for (const source of rel.mediaSources || []) {
        const bucket = getBucket(record.mediaSources, source);
        bucket.inFlight = Math.max(0, bucket.inFlight - 1);
        bucket.cooldownUntil = Math.max(bucket.cooldownUntil, now + this._nextCooldownMs());
      }

      if (rel.serverError) {
        record.serverBackoffUntil = Math.max(
          record.serverBackoffUntil,
          now + this.serverBackoffMs
        );
      }
    }
  }

  snapshot(now = Date.now()) {
    return this.serverUrls.map((url) => {
      const record = this.servers.get(url);
      if (!record) return { url, engines: {}, mediaSources: {} };

      const engines = {};
      for (const [name, bucket] of record.engines.entries()) {
        engines[name] = {
          inFlight: bucket.inFlight,
          cooldownRemainingMs: Math.max(0, bucket.cooldownUntil - now)
        };
      }
      const mediaSources = {};
      for (const [name, bucket] of record.mediaSources.entries()) {
        mediaSources[name] = {
          inFlight: bucket.inFlight,
          cooldownRemainingMs: Math.max(0, bucket.cooldownUntil - now)
        };
      }
      return {
        url,
        serverBackoffRemainingMs: Math.max(0, record.serverBackoffUntil - now),
        auxInFlight: record.auxInFlight,
        engines,
        mediaSources
      };
    });
  }
}

export function createInMemoryCoordinator(state = new SearchRouterState()) {
  return {
    async reserve(payload) {
      return state.reserveBatch(payload);
    },
    async release(payload) {
      state.releaseBatch(payload.releases || []);
    }
  };
}

const defaultProcessState = new SearchRouterState();
export const defaultSearchCoordinator = createInMemoryCoordinator(defaultProcessState);

/**
 * Normalize a single SearXNG `/stats` payload into ready/cooling Tier-1 & Tier-2 engine inventories.
 */
export function parseServerStatsPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.engines)) {
    return {
      ok: false,
      readyTier1Engines: [],
      readyTier2Engines: [],
      tier1Engines: []
    };
  }

  const readyTier1Engines = [];
  const readyTier2Engines = [];
  const tier1Engines = [];

  for (const engine of payload.engines) {
    if (!engine || typeof engine !== 'object') continue;
    const name = typeof engine.name === 'string' ? engine.name.trim() : '';
    if (!name) continue;
    const tier = Number(engine.tier) || 3;
    const status = String(engine.status || '');
    const consecutiveFailures = Number(engine.consecutive_failures) || 0;
    const cooldownRemainingMs = Math.max(0, (Number(engine.cooldown_remaining_sec) || 0) * 1000);

    if (tier === 1) {
      tier1Engines.push({ name, status, consecutiveFailures, cooldownRemainingMs });
      if (status === 'ready' && consecutiveFailures < 3) {
        readyTier1Engines.push(name);
      }
    } else if (tier === 2 && status === 'ready' && consecutiveFailures < 3) {
      readyTier2Engines.push(name);
    }
  }

  return {
    ok: true,
    readyTier1Engines,
    readyTier2Engines,
    tier1Engines
  };
}

function buildAuthHeaders(apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function fetchJsonWithTimeout(url, init, timeoutMs, fetchImpl, parentSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Search request timed out')), timeoutMs);
  const forwardAbort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data, rawText: text };
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Send parallel `/stats` probes to all configured search servers (2 requests for 2 servers).
 * Waits up to `timeoutMs` on cold starts, or returns within `graceAfterFirstOkMs` once one server is live.
 */
export async function fetchAllServerStats(
  serverUrls,
  {
    apiKey = '',
    timeoutMs = DEFAULT_STATS_TIMEOUT_MS,
    graceAfterFirstOkMs = DEFAULT_STATS_GRACE_MS,
    fetchImpl = fetch,
    signal
  } = {}
) {
  const headers = buildAuthHeaders(apiKey);
  const results = new Map();

  const probeOne = async (url) => {
    try {
      const res = await fetchJsonWithTimeout(
        `${url}/stats`,
        { method: 'GET', headers },
        timeoutMs,
        fetchImpl,
        signal
      );
      if (!res.ok) {
        return [url, { ok: false, status: res.status, readyTier1Engines: [], readyTier2Engines: [], tier1Engines: [] }];
      }
      return [url, parseServerStatsPayload(res.data)];
    } catch (error) {
      return [
        url,
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          readyTier1Engines: [],
          readyTier2Engines: [],
          tier1Engines: []
        }
      ];
    }
  };

  let graceTimer = null;
  let resolvedEarly = false;
  let notifyAnyOk = null;
  const firstOkPromise = new Promise((resolve) => {
    notifyAnyOk = resolve;
  });

  const allDone = Promise.all(
    serverUrls.map(async (url) => {
      const [key, value] = await probeOne(url);
      results.set(key, value);
      if (value.ok && notifyAnyOk) {
        notifyAnyOk();
        notifyAnyOk = null;
      }
      return [key, value];
    })
  );

  const graceRace = firstOkPromise.then(
    () =>
      new Promise((resolve) => {
        graceTimer = setTimeout(() => {
          resolvedEarly = true;
          resolve();
        }, graceAfterFirstOkMs);
      })
  );

  await Promise.race([allDone, graceRace]);
  if (graceTimer) clearTimeout(graceTimer);

  if (resolvedEarly) {
    // Keep any unfinished probes silent in the background without unhandled rejections.
    allDone.catch(() => {});
    for (const url of serverUrls) {
      if (!results.has(url)) {
        results.set(url, {
          ok: false,
          error: 'Stats probe exceeded fast grace window',
          readyTier1Engines: [],
          readyTier2Engines: [],
          tier1Engines: []
        });
      }
    }
  }

  return Object.fromEntries(serverUrls.map((url) => [url, results.get(url)]));
}

let lastPrewarmAt = 0;

/**
 * Gently wake up Render search instances in the background (throttled to every 4 minutes).
 */
export function prewarmSearchServers(
  serverUrls = DEFAULT_SEARCH_SERVERS,
  { apiKey = '', fetchImpl = fetch, force = false } = {}
) {
  const now = Date.now();
  if (!force && now - lastPrewarmAt < PREWARM_INTERVAL_MS) return Promise.resolve();
  lastPrewarmAt = now;

  const urls = parseSearchServers(Array.isArray(serverUrls) ? serverUrls.join(',') : serverUrls);
  const headers = buildAuthHeaders(apiKey);
  return Promise.allSettled(
    urls.map((url) =>
      fetchJsonWithTimeout(`${url}/healthz`, { method: 'GET', headers }, 10_000, fetchImpl)
    )
  );
}

function normalizeResultItem(item, fallbackSource = '') {
  const url = typeof item?.url === 'string' ? item.url.trim() : '';
  const source =
    (typeof item?.source === 'string' && item.source.trim()) ||
    (Array.isArray(item?.engines) && typeof item.engines[0] === 'string' ? item.engines[0] : '') ||
    fallbackSource;

  const entry = {
    title: typeof item?.title === 'string' ? item.title.trim() : '',
    url,
    site: extractSiteHost(url),
    snippet: typeof item?.snippet === 'string'
      ? item.snippet.trim()
      : typeof item?.content === 'string'
        ? item.content.trim().slice(0, 320)
        : ''
  };
  if (source) entry.source = source;
  if (Array.isArray(item?.engines) && item.engines.length > 0) entry.engines = item.engines;
  if (typeof item?.published === 'string' && item.published) entry.published = item.published;
  if (typeof item?.content === 'string' && item.content && item.content !== entry.snippet) {
    entry.content = item.content;
    if (item.content_truncated) entry.content_truncated = true;
  }
  if (Array.isArray(item?.feed_items) && item.feed_items.length > 0) {
    entry.feed_items = item.feed_items;
  }
  return entry;
}

/**
 * Interleave multi-source media results fairly so one high-volume source does not crowd out others.
 */
function balanceMediaResults(rawResults, requestedSources, limit) {
  const normalized = rawResults.map((item) => normalizeResultItem(item));
  if (requestedSources.length <= 1 || normalized.length <= limit) {
    return normalized.slice(0, limit);
  }

  const buckets = new Map();
  for (const item of normalized) {
    const key = item.source || item.site || 'other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const picked = [];
  const seenUrls = new Set();
  const lists = Array.from(buckets.values());
  let round = 0;

  while (picked.length < limit) {
    let addedInRound = false;
    for (const list of lists) {
      if (round >= list.length) continue;
      const item = list[round];
      const dedupeKey = item.url || item.title;
      if (dedupeKey && seenUrls.has(dedupeKey)) continue;
      if (dedupeKey) seenUrls.add(dedupeKey);
      picked.push(item);
      addedInRound = true;
      if (picked.length >= limit) break;
    }
    if (!addedInRound) break;
    round += 1;
  }

  return picked;
}

function buildToolEndpointSpec(call, activeMediaSources, smartFetchSelection = false) {
  const name = call.name;
  const args = call.args && typeof call.args === 'object' ? call.args : {};

  if (name === 'web_search') {
    const query = cleanString(args.query, 400);
    const limit = clampInt(args.limit, 8, 1, MAX_RESULTS_PER_QUERY);
    const requestedFetchTop = clampInt(args.fetch_top, 0, 0, 3);
    const useSmartFetch = Boolean(smartFetchSelection && requestedFetchTop > 0);
    const searchLimit = useSmartFetch
      ? Math.min(MAX_RESULTS_PER_QUERY, Math.max(limit, requestedFetchTop * 4))
      : limit;
    const params = new URLSearchParams({
      q: query,
      category: cleanString(args.category, 32) || 'web',
      limit: String(searchLimit),
      multi: '1',
      fetch_top: String(useSmartFetch ? 0 : requestedFetchTop),
      lang: cleanString(args.lang, 16) || 'auto'
    });
    return {
      path: `/api/search?${params.toString()}`,
      headers: { 'X-Router-Peer-Hop': '1' },
      smartMeta: {
        kind: 'results',
        query,
        requestedLimit: limit,
        fetchTop: useSmartFetch ? requestedFetchTop : 0
      },
      transform: (data, serverUrl) => ({
        ok: true,
        query: data?.query || query,
        category: data?.category || 'web',
        server_used: serverUrl,
        engines_used: data?.engines_used || [],
        answers: data?.answers || [],
        infoboxes: (data?.infoboxes || []).slice(0, 2),
        results: (data?.results || []).slice(0, searchLimit).map((item) => normalizeResultItem(item))
      })
    };
  }

  if (name === 'media_search') {
    const query = cleanString(args.query, 400);
    const limit = clampInt(args.limit, 8, 1, MAX_RESULTS_PER_QUERY);
    const requestedFetchTop = clampInt(args.fetch_top, 0, 0, 3);
    const useSmartFetch = Boolean(smartFetchSelection && requestedFetchTop > 0);
    const searchLimit = useSmartFetch
      ? Math.min(MAX_RESULTS_PER_QUERY, Math.max(limit, requestedFetchTop * 4))
      : limit;
    const sources = activeMediaSources.length > 0 ? activeMediaSources : resolveMediaSources(args.sources);
    const upstreamLimit = Math.min(30, Math.max(searchLimit * 2, sources.length * 3));
    const params = new URLSearchParams({
      q: query,
      sources: sources.join(','),
      limit: String(upstreamLimit),
      fetch_top: String(useSmartFetch ? 0 : requestedFetchTop),
      lang: cleanString(args.lang, 16) || 'auto'
    });
    return {
      path: `/api/media?${params.toString()}`,
      headers: { 'X-Router-Peer-Hop': '1' },
      smartMeta: {
        kind: 'results',
        query,
        requestedLimit: limit,
        fetchTop: useSmartFetch ? requestedFetchTop : 0
      },
      transform: (data, serverUrl) => ({
        ok: true,
        query: data?.query || query,
        server_used: serverUrl,
        sources_requested: sources,
        sources_used: data?.sources_used || [],
        source_counts: data?.source_counts || {},
        results: balanceMediaResults(data?.results || [], sources, searchLimit)
      })
    };
  }

  if (name === 'wiki_search') {
    const query = cleanString(args.query, 400);
    const limit = clampInt(args.limit, 5, 1, MAX_RESULTS_PER_QUERY);
    const params = new URLSearchParams({
      q: query,
      lang: cleanString(args.lang, 16) || 'auto',
      limit: String(limit),
      include_wikidata: args.include_wikidata === false ? 'false' : 'true',
      include_web: 'false'
    });
    return {
      path: `/api/facts?${params.toString()}`,
      headers: {},
      transform: (data, serverUrl) => ({
        ok: true,
        query: data?.query || query,
        lang: data?.lang || 'auto',
        server_used: serverUrl,
        wikipedia: (data?.wikipedia || []).slice(0, limit).map((item) => normalizeResultItem(item, 'wikipedia')),
        wikidata: (data?.wikidata || []).slice(0, limit).map((item) => normalizeResultItem(item, 'wikidata')),
        results: (data?.results || []).slice(0, limit).map((item) => normalizeResultItem(item, 'wikipedia'))
      })
    };
  }

  if (name === 'wiki_page') {
    const title = cleanString(args.title, 400);
    const params = new URLSearchParams({
      title,
      lang: cleanString(args.lang, 16) || 'auto',
      max_chars: String(clampInt(args.max_chars, 12000, 500, 30000))
    });
    return {
      path: `/api/wiki?${params.toString()}`,
      headers: {},
      transform: (data, serverUrl) => ({
        ok: Boolean(data?.found),
        found: Boolean(data?.found),
        server_used: serverUrl,
        title: data?.title || title,
        url: data?.url || '',
        site: extractSiteHost(data?.url || ''),
        description: data?.description || '',
        lang: data?.lang || 'auto',
        content: data?.content || '',
        truncated: Boolean(data?.truncated)
      })
    };
  }

  if (name === 'news_search') {
    const query = cleanString(args.query, 400);
    const limit = clampInt(args.limit, 8, 1, MAX_RESULTS_PER_QUERY);
    const requestedFetchTop = clampInt(args.fetch_top, 0, 0, 3);
    const useSmartFetch = Boolean(smartFetchSelection && requestedFetchTop > 0);
    const searchLimit = useSmartFetch
      ? Math.min(MAX_RESULTS_PER_QUERY, Math.max(limit, requestedFetchTop * 4))
      : limit;
    const params = new URLSearchParams({
      q: query,
      lang: cleanString(args.lang, 16) || 'auto',
      limit: String(searchLimit),
      sources: 'all',
      fetch_top: String(useSmartFetch ? 0 : requestedFetchTop)
    });
    return {
      path: `/api/news?${params.toString()}`,
      headers: { 'X-Router-Peer-Hop': '1' },
      smartMeta: {
        kind: 'results',
        query,
        requestedLimit: limit,
        fetchTop: useSmartFetch ? requestedFetchTop : 0
      },
      transform: (data, serverUrl) => ({
        ok: true,
        query: data?.query ?? query,
        mode: data?.mode || (query ? 'search' : 'latest'),
        server_used: serverUrl,
        sources_used: data?.sources_used || [],
        results: (data?.results || []).slice(0, searchLimit).map((item) => normalizeResultItem(item))
      })
    };
  }

  if (name === 'fetch_url') {
    const targetUrl = cleanString(args.url, 1500);
    const params = new URLSearchParams({
      url: targetUrl,
      max_chars: String(clampInt(args.max_chars, 12000, 500, 30000)),
      include_links: args.include_links === false ? 'false' : 'true',
      format: args.format === 'text' ? 'text' : 'markdown'
    });
    return {
      path: `/api/fetch?${params.toString()}`,
      headers: {},
      transform: (data, serverUrl) => ({
        ok: true,
        server_used: serverUrl,
        url: data?.final_url || data?.url || targetUrl,
        site: extractSiteHost(data?.final_url || data?.url || targetUrl),
        kind: data?.kind || 'text',
        title: data?.title || '',
        description: data?.description || '',
        content: data?.content || '',
        items: Array.isArray(data?.items) ? data.items.slice(0, MAX_RESULTS_PER_QUERY) : undefined,
        truncated: Boolean(data?.truncated)
      })
    };
  }

  // research_topic
  const query = cleanString(args.query, 400);
  const limit = clampInt(args.limit, 6, 1, MAX_RESULTS_PER_QUERY);
  const params = new URLSearchParams({
    q: query,
    lang: cleanString(args.lang, 16) || 'auto',
    include_news: args.include_news === false ? 'false' : 'true',
    limit: String(limit),
    fetch_top: String(clampInt(args.fetch_top, 2, 0, 3)),
    max_chars: String(clampInt(args.max_chars, 5000, 500, 15000))
  });
  return {
    path: `/api/research?${params.toString()}`,
    headers: { 'X-Router-Peer-Hop': '1' },
    smartMeta: {
      kind: 'research',
      query,
      requestedLimit: limit,
      fetchTop: 0
    },
    transform: (data, serverUrl) => ({
      ok: true,
      query: data?.query || query,
      server_used: serverUrl,
      web: {
        engines_used: data?.web?.engines_used || [],
        answers: data?.web?.answers || [],
        results: (data?.web?.results || []).slice(0, limit).map((item) => normalizeResultItem(item))
      },
      facts: {
        lang: data?.facts?.lang || 'auto',
        wikipedia: (data?.facts?.wikipedia || []).slice(0, limit).map((item) => normalizeResultItem(item, 'wikipedia')),
        wikidata: (data?.facts?.wikidata || []).slice(0, limit).map((item) => normalizeResultItem(item, 'wikidata'))
      },
      news: {
        sources_used: data?.news?.sources_used || [],
        results: (data?.news?.results || []).slice(0, limit).map((item) => normalizeResultItem(item))
      }
    })
  };
}

function classifyCall(call, index, turnBudget) {
  const name = call.name;
  const args = call.args && typeof call.args === 'object' ? call.args : {};

  if (name === 'web_search' || name === 'research_topic') {
    const query = cleanString(args.query, 400);
    if (!query) {
      return { immediateResult: { ok: false, error: 'Missing required parameter: query' } };
    }
    if (turnBudget.webUsed >= turnBudget.maxWeb) {
      return {
        immediateResult: {
          ok: false,
          limit_reached: true,
          error: `Per-message web search limit reached (max ${turnBudget.maxWeb} web queries per message). Answer using the results already gathered.`
        }
      };
    }
    turnBudget.webUsed += 1;
    const category = cleanString(args.category, 32).toLowerCase() || 'web';
    const isMediaCategory = name === 'web_search' && category === 'news';
    if (isMediaCategory) {
      return {
        job: { id: index, kind: 'media', sources: ['wikinews', 'news'], isPreset: true },
        call
      };
    }
    if (name === 'web_search' && category === 'facts') {
      return {
        job: { id: index, kind: 'aux', sources: [] },
        call
      };
    }
    return {
      job: { id: index, kind: 'web', sources: [] },
      call
    };
  }

  if (name === 'media_search') {
    const query = cleanString(args.query, 400);
    if (!query) {
      return { immediateResult: { ok: false, error: 'Missing required parameter: query' } };
    }
    if (turnBudget.mediaUsed >= turnBudget.maxMedia) {
      return {
        immediateResult: {
          ok: false,
          limit_reached: true,
          error: `Per-message media search limit reached (max ${turnBudget.maxMedia} media queries per message). Answer using the results already gathered.`
        }
      };
    }
    turnBudget.mediaUsed += 1;
    const rawSources = String(args.sources || 'all').trim().toLowerCase();
    const isPreset = !rawSources || rawSources in MEDIA_PRESETS;
    return {
      job: {
        id: index,
        kind: 'media',
        sources: resolveMediaSources(args.sources),
        isPreset
      },
      call
    };
  }

  if (name === 'news_search') {
    if (turnBudget.mediaUsed >= turnBudget.maxMedia) {
      return {
        immediateResult: {
          ok: false,
          limit_reached: true,
          error: `Per-message media/news search limit reached (max ${turnBudget.maxMedia} queries per message).`
        }
      };
    }
    turnBudget.mediaUsed += 1;
    return {
      job: { id: index, kind: 'media', sources: ['wikinews', 'news'], isPreset: true },
      call
    };
  }

  if (name === 'wiki_search' || name === 'wiki_page' || name === 'fetch_url') {
    if (name === 'wiki_search' && !cleanString(args.query, 400)) {
      return { immediateResult: { ok: false, error: 'Missing required parameter: query' } };
    }
    if (name === 'wiki_page' && !cleanString(args.title, 400)) {
      return { immediateResult: { ok: false, error: 'Missing required parameter: title' } };
    }
    if (name === 'fetch_url' && !cleanString(args.url, 1500)) {
      return { immediateResult: { ok: false, error: 'Missing required parameter: url' } };
    }
    if (turnBudget.auxUsed >= turnBudget.maxAux) {
      return {
        immediateResult: {
          ok: false,
          limit_reached: true,
          error: `Per-message page/wiki lookup limit reached (max ${turnBudget.maxAux}).`
        }
      };
    }
    turnBudget.auxUsed += 1;
    return {
      job: { id: index, kind: 'aux', sources: [] },
      call
    };
  }

  return {
    immediateResult: { ok: false, error: `Unknown search tool: ${name}` }
  };
}

function defaultSleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Execute a batch of AI search/fetch calls using two-server `/stats` inspection,
 * primary-to-secondary overflow routing, and per-engine / per-media 20-30s cooldowns.
 */
export async function executeSearchBatch(
  calls,
  turnBudget = createTurnSearchBudget(),
  {
    servers = DEFAULT_SEARCH_SERVERS,
    apiKey = '',
    decisionApiKey = '',
    decisionFetchImpl = null,
    coordinator = defaultSearchCoordinator,
    fetchImpl = fetch,
    statsTimeoutMs = DEFAULT_STATS_TIMEOUT_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    maxCooldownWaitMs = DEFAULT_MAX_COOLDOWN_WAIT_MS,
    sleepImpl = defaultSleep,
    signal
  } = {}
) {
  const serverUrls = parseSearchServers(Array.isArray(servers) ? servers.join(',') : servers);
  const smartFetchSelection = Boolean(typeof decisionApiKey === 'string' && decisionApiKey.trim());
  const results = new Array(calls.length);
  const smartMetaByIndex = new Map();
  const activeItems = [];

  for (let i = 0; i < calls.length; i += 1) {
    const classified = classifyCall(calls[i], i, turnBudget);
    if (classified.immediateResult) {
      results[i] = classified.immediateResult;
    } else {
      activeItems.push(classified);
    }
  }

  const attachBudgetRemaining = (list) => {
    const budgetRemaining = {
      web_search: Math.max(0, turnBudget.maxWeb - turnBudget.webUsed),
      media_search: Math.max(0, turnBudget.maxMedia - turnBudget.mediaUsed)
    };
    return list.map((entry) =>
      entry && typeof entry === 'object'
        ? { ...entry, budget_remaining: budgetRemaining }
        : entry
    );
  };

  if (activeItems.length === 0) return attachBudgetRemaining(results);

  // Step 1: 2 parallel `/stats` probes across the 2 search servers.
  let statsByUrl = await fetchAllServerStats(serverUrls, {
    apiKey,
    timeoutMs: statsTimeoutMs,
    fetchImpl,
    signal
  });

  // Step 2: Reserve slots on Server 0 first, spilling overflow to Server 1.
  let plan = await coordinator.reserve({
    servers: serverUrls,
    jobs: activeItems.map((item) => item.job),
    statsByUrl
  });

  // If any job hit a short remaining cooldown within wait budget, wait briefly once and re-reserve.
  const waitingJobs = [];
  const assignedById = new Map();
  let shortestWaitMs = Infinity;

  for (const assignment of plan.assignments || []) {
    assignedById.set(assignment.id, assignment);
    if (assignment.status !== 'assigned') {
      waitingJobs.push(assignment);
      if (typeof assignment.waitMs === 'number' && assignment.waitMs > 0) {
        shortestWaitMs = Math.min(shortestWaitMs, assignment.waitMs);
      }
    }
  }

  if (
    waitingJobs.length > 0 &&
    Number.isFinite(shortestWaitMs) &&
    shortestWaitMs <= maxCooldownWaitMs &&
    !signal?.aborted
  ) {
    await sleepImpl(shortestWaitMs + 50, signal);
    const retryJobs = activeItems
      .filter((item) => !assignedById.has(item.job.id))
      .map((item) => item.job);
    statsByUrl = await fetchAllServerStats(serverUrls, {
      apiKey,
      timeoutMs: statsTimeoutMs,
      fetchImpl,
      signal
    });
    const retryPlan = await coordinator.reserve({
      servers: serverUrls,
      jobs: retryJobs,
      statsByUrl
    });
    for (const assignment of retryPlan.assignments || []) {
      assignedById.set(assignment.id, assignment);
    }
  }

  const releases = [];
  const baseHeaders = buildAuthHeaders(apiKey);
  const failedItemsForRetry = [];

  async function runAssignedItem(item, assignment) {
    const idx = item.job.id;
    const spec = buildToolEndpointSpec(item.call, assignment.mediaSources || [], smartFetchSelection);
    if (spec.smartMeta) smartMetaByIndex.set(idx, spec.smartMeta);
    let serverError = false;
    const additionalEngines = [];

    try {
      const response = await fetchJsonWithTimeout(
        `${assignment.serverUrl}${spec.path}`,
        {
          method: 'GET',
          headers: { ...baseHeaders, ...spec.headers }
        },
        requestTimeoutMs,
        fetchImpl,
        signal
      );

      if (response.data && Array.isArray(response.data.engines_tried)) {
        for (const eng of response.data.engines_tried) {
          if (typeof eng === 'string' && eng !== assignment.engineName) {
            additionalEngines.push(eng);
          }
        }
      }

      if (!response.ok) {
        serverError = response.status >= 500;
        const errMessage = response.data?.error || `Search server HTTP ${response.status}`;
        results[idx] = {
          ok: false,
          server_used: assignment.serverUrl,
          error: errMessage
        };
        return { ok: false, serverError };
      }

      results[idx] = spec.transform(response.data, assignment.serverUrl);
      return { ok: true, serverError: false };
    } catch (error) {
      serverError = true;
      results[idx] = {
        ok: false,
        server_used: assignment.serverUrl,
        error: error instanceof Error ? error.message : String(error)
      };
      return { ok: false, serverError: true };
    } finally {
      releases.push({
        reservationId: assignment.reservationId,
        kind: assignment.kind,
        serverUrl: assignment.serverUrl,
        engineName: assignment.engineName,
        additionalEngines,
        mediaSources: assignment.mediaSources || [],
        serverError
      });
    }
  }

  // Step 3: Execute all assigned calls in parallel.
  await Promise.all(
    activeItems.map(async (item) => {
      const idx = item.job.id;
      const assignment = assignedById.get(idx);

      if (!assignment || assignment.status !== 'assigned') {
        const waitSec =
          assignment && typeof assignment.waitMs === 'number' && assignment.waitMs > 0
            ? Math.ceil(assignment.waitMs / 1000)
            : 25;
        results[idx] = {
          ok: false,
          cooldown: assignment?.status === 'cooldown',
          retry_after_sec: waitSec,
          error:
            assignment?.status === 'cooldown'
              ? `Search engines/sources for this request are in 20-30s anti-block cooldown (ready in ~${waitSec}s).`
              : 'Search servers are currently unavailable.'
        };
        return;
      }

      const outcome = await runAssignedItem(item, assignment);
      if (!outcome.ok && outcome.serverError && serverUrls.length > 1) {
        failedItemsForRetry.push({ item, failedServerUrl: assignment.serverUrl });
      }
    })
  );

  if (releases.length > 0) {
    await coordinator.release({ releases: releases.splice(0, releases.length) }).catch(() => {});
  }

  // Step 4: One-shot failover to secondary server if primary failed with 5xx/network error.
  if (failedItemsForRetry.length > 0 && !signal?.aborted) {
    const retryPlan = await coordinator.reserve({
      servers: serverUrls,
      jobs: failedItemsForRetry.map((entry) => entry.item.job),
      statsByUrl
    });
    const retryAssigned = new Map(
      (retryPlan.assignments || []).map((assignment) => [assignment.id, assignment])
    );

    await Promise.all(
      failedItemsForRetry.map(async ({ item, failedServerUrl }) => {
        const assignment = retryAssigned.get(item.job.id);
        if (!assignment || assignment.status !== 'assigned') return;
        if (assignment.serverUrl === failedServerUrl) {
          releases.push({
            reservationId: assignment.reservationId,
            kind: assignment.kind,
            serverUrl: assignment.serverUrl,
            engineName: assignment.engineName,
            additionalEngines: [],
            mediaSources: assignment.mediaSources || [],
            serverError: false
          });
          return;
        }
        await runAssignedItem(item, assignment);
      })
    );

    if (releases.length > 0) {
      await coordinator.release({ releases }).catch(() => {});
    }
  }

  // Step 5: Smart `gemini-decision-1` filtering/selection + selective `/api/fetch` + main-content distillation.
  const activeDecisionFetch = decisionFetchImpl || fetchImpl;
  const fetchRequests = [];

  await Promise.all(
    results.map(async (entry, idx) => {
      if (!entry || typeof entry !== 'object' || entry.ok !== true) return;
      const meta = smartMetaByIndex.get(idx);

      if (meta?.kind === 'results' && Array.isArray(entry.results) && entry.results.length > 0) {
        const ranked = await rankSearchCandidatesWithDecision1(entry.results, {
          query: meta.query || entry.query || '',
          apiKey: decisionApiKey,
          fetchTop: meta.fetchTop || 0,
          maxKeep: meta.requestedLimit || MAX_RESULTS_PER_QUERY,
          fetchImpl: activeDecisionFetch,
          signal
        });
        entry.results = ranked.items;
        if (ranked.usedDecisionApi) entry.decision_filtered = true;
        if (ranked.fetchCandidateIndices.length > 0) {
          for (const itemIdx of ranked.fetchCandidateIndices) {
            const targetUrl = entry.results[itemIdx]?.url;
            if (typeof targetUrl === 'string' && /^https?:\/\//i.test(targetUrl)) {
              fetchRequests.push({
                entryIndex: idx,
                itemIndex: itemIdx,
                url: targetUrl,
                query: meta.query || entry.query || ''
              });
            }
          }
        }
        return;
      }

      if (meta?.kind === 'research') {
        if (Array.isArray(entry.web?.results) && entry.web.results.length > 0) {
          const rankedWeb = await rankSearchCandidatesWithDecision1(entry.web.results, {
            query: meta.query || entry.query || '',
            apiKey: decisionApiKey,
            fetchTop: 0,
            maxKeep: meta.requestedLimit || MAX_RESULTS_PER_QUERY,
            fetchImpl: activeDecisionFetch,
            signal
          });
          entry.web.results = rankedWeb.items;
          if (rankedWeb.usedDecisionApi) entry.decision_filtered = true;
        }
        if (Array.isArray(entry.news?.results) && entry.news.results.length > 0) {
          const rankedNews = await rankSearchCandidatesWithDecision1(entry.news.results, {
            query: meta.query || entry.query || '',
            apiKey: '',
            fetchTop: 0,
            maxKeep: meta.requestedLimit || MAX_RESULTS_PER_QUERY
          });
          entry.news.results = rankedNews.items;
        }
      }
    })
  );

  if (fetchRequests.length > 0 && !signal?.aborted) {
    const onlineServers = serverUrls.filter((url) => statsByUrl[url]?.ok);
    const fetchPool = onlineServers.length > 0 ? onlineServers : serverUrls;
    const uniqueUrls = Array.from(new Set(fetchRequests.map((req) => req.url)));
    const fetchedByUrl = new Map();

    await Promise.all(
      uniqueUrls.map(async (targetUrl, pos) => {
        const chosenServer = fetchPool[pos % fetchPool.length];
        if (!chosenServer) return;
        const params = new URLSearchParams({
          url: targetUrl,
          max_chars: '4500',
          include_links: 'false',
          format: 'markdown'
        });
        try {
          const res = await fetchJsonWithTimeout(
            `${chosenServer}/api/fetch?${params.toString()}`,
            { method: 'GET', headers: baseHeaders },
            requestTimeoutMs,
            fetchImpl,
            signal
          );
          if (res.ok && typeof res.data?.content === 'string' && res.data.content.trim()) {
            fetchedByUrl.set(targetUrl, res.data.content);
          }
        } catch {
          // non-fatal: keep snippet when single page fetch times out
        }
      })
    );

    for (const req of fetchRequests) {
      const rawContent = fetchedByUrl.get(req.url);
      if (!rawContent) continue;
      const targetItem = results[req.entryIndex]?.results?.[req.itemIndex];
      if (!targetItem) continue;
      const cleanExcerpt = extractMainContentExcerpt(rawContent, req.query, MAX_FETCH_TOP_CONTENT_CHARS);
      if (cleanExcerpt) {
        targetItem.content = cleanExcerpt;
      }
    }
  }

  for (let i = 0; i < results.length; i += 1) {
    const meta = smartMetaByIndex.get(i);
    results[i] = distillToolPayloadContent(results[i], meta?.query || results[i]?.query || '');
  }

  return attachBudgetRemaining(results);
}
