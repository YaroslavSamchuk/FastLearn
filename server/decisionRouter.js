// language: JavaScript, file: server/decisionRouter.js, target: Node.js & Cloudflare Workers

export const DECISIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions';
export const DECISION_MODEL = 'gemini-decision-1';
export const MAX_DECISION_CANDIDATES = 15;
export const MAX_DECISION_INPUT_CHARS = 4_200;
export const MAX_DECISION_RPM_TOKENS = 40_000;
export const DEFAULT_DECISION_TIMEOUT_MS = 4_000;
export const MAX_MAIN_CONTENT_CHARS = 4_500;
export const MAX_FETCH_TOP_CONTENT_CHARS = 2_400;

const SCORE_CRITERIA = [
  'Off-topic, spam, login wall, or dead archive',
  'Weak or shallow mention',
  'Moderately relevant',
  'Solid useful source',
  'Authoritative primary source'
];

const BOILERPLATE_LINE_RE =
  /^(?:skip to (?:main )?content|accept(?: all)? cookies?|manage (?:cookie )?preferences|cookie policy|privacy policy|terms of (?:use|service)|all rights reserved|sign in|log in|sign up|create account|subscribe(?: to newsletter)?|follow us|share on (?:x|twitter|facebook|linkedin|reddit)|table of contents|advertisement|sponsored|©\s*(?:19|20)\d{2}\b)/i;

const tpmWindow = [];
let decisionCooldownUntil = 0;

function cleanInline(value, maxChars) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxChars) : '';
}

function extractSiteHost(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 3.8);
}

function pruneTpmWindow(now) {
  const cutoff = now - 60_000;
  while (tpmWindow.length > 0 && tpmWindow[0].ts < cutoff) {
    tpmWindow.shift();
  }
}

export function canUseDecisionBudget(estimatedInputTokens, now = Date.now()) {
  if (now < decisionCooldownUntil) return false;
  pruneTpmWindow(now);
  const used = tpmWindow.reduce((sum, entry) => sum + entry.tokens, 0);
  return used + estimatedInputTokens <= MAX_DECISION_RPM_TOKENS;
}

export function resetDecisionLimiterForTests() {
  tpmWindow.length = 0;
  decisionCooldownUntil = 0;
}

function recordDecisionUsage(tokens, now = Date.now()) {
  pruneTpmWindow(now);
  tpmWindow.push({ ts: now, tokens: Math.max(0, Number(tokens) || 0) });
}

function isLinkDenseNavigationLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 220) return false;
  const linkMatches = trimmed.match(/\[[^\]]+\]\([^)]+\)/g) || [];
  if (linkMatches.length >= 3) {
    const plain = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[|•·›»/\-\s]+/g, '');
    if (plain.length < trimmed.length * 0.45) return true;
  }
  const pipeCount = (trimmed.match(/\s[|•·›]\s/g) || []).length;
  return pipeCount >= 4 && trimmed.length < 180;
}

function tokenizeQuery(query) {
  if (typeof query !== 'string') return [];
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 3)
    )
  );
}

/**
 * Strip web chrome, cookie prompts, nav link bars, and boilerplate, returning
 * query-prioritized main prose within `maxChars`.
 */
export function extractMainContentExcerpt(rawText, query = '', maxChars = MAX_MAIN_CONTENT_CHARS) {
  if (typeof rawText !== 'string') return '';
  const normalized = rawText
    .replace(/\r\n?/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return '';

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => {
          const t = line.trim();
          if (!t) return false;
          if (BOILERPLATE_LINE_RE.test(t)) return false;
          if (isLinkDenseNavigationLine(t)) return false;
          return true;
        })
        .join('\n')
        .trim()
    )
    .filter(Boolean);

  const seen = new Set();
  const cleanBlocks = [];
  for (const block of blocks) {
    const key = block.toLowerCase().replace(/\s+/g, ' ').slice(0, 140);
    if (key.length > 15 && seen.has(key)) continue;
    seen.add(key);
    cleanBlocks.push(block);
  }

  const joined = cleanBlocks.join('\n\n');
  if (!joined) return '';
  if (joined.length <= maxChars) return joined;

  const queryTerms = tokenizeQuery(query);
  if (queryTerms.length === 0 || cleanBlocks.length <= 2) {
    const sliced = joined.slice(0, maxChars);
    const lastBreak = Math.max(sliced.lastIndexOf('\n\n'), sliced.lastIndexOf('. '), sliced.lastIndexOf(' '));
    return (lastBreak > maxChars * 0.65 ? sliced.slice(0, lastBreak + 1) : sliced).trim();
  }

  const scored = cleanBlocks.map((block, index) => {
    const lower = block.toLowerCase();
    let score = index === 0 ? 1.5 : 0;
    if (/^#{1,3}\s/.test(block)) score += 0.4;
    for (const term of queryTerms) {
      if (lower.includes(term)) score += 2.0;
    }
    if (block.length >= 120 && !/^[-*]\s/.test(block)) score += 0.6;
    return { index, block, score };
  });

  const ranked = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);
  const chosenIndices = new Set();
  let totalChars = 0;

  for (const entry of ranked) {
    const cost = entry.block.length + (chosenIndices.size > 0 ? 2 : 0);
    if (totalChars + cost > maxChars && chosenIndices.size > 0) continue;
    if (totalChars + cost > maxChars) {
      chosenIndices.add(entry.index);
      break;
    }
    chosenIndices.add(entry.index);
    totalChars += cost;
    if (totalChars >= maxChars * 0.92) break;
  }

  const ordered = cleanBlocks
    .filter((_, idx) => chosenIndices.has(idx))
    .join('\n\n');

  if (ordered.length <= maxChars) return ordered;
  return ordered.slice(0, maxChars).trim();
}

/**
 * Build a compact candidate digest strictly under `MAX_DECISION_INPUT_CHARS` so
 * `gemini-decision-1` evaluates metadata and short excerpts rather than full pages.
 */
export function buildDecisionDigest(query, candidates) {
  const cleanQuery = cleanInline(query, 180);
  const header = cleanQuery ? `Query: ${cleanQuery}` : 'Evaluate search candidates';
  const lines = [header];
  let totalChars = header.length;

  const list = Array.isArray(candidates) ? candidates.slice(0, MAX_DECISION_CANDIDATES) : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i] || {};
    const site = cleanInline(item.site, 40) || extractSiteHost(item.url) || 'web';
    const title = cleanInline(item.title, 75) || site;
    const meta = [cleanInline(item.source, 20), cleanInline(item.published, 24)].filter(Boolean).join(',');
    const snippetSource = item.snippet || (item.content ? extractMainContentExcerpt(item.content, query, 160) : '');
    const snippet = cleanInline(snippetSource, 150);

    const line = `[${i}] ${site}${meta ? ` (${meta})` : ''} | ${title}${snippet ? ` | ${snippet}` : ''}`;
    if (totalChars + line.length + 1 > MAX_DECISION_INPUT_CHARS) break;
    lines.push(line);
    totalChars += line.length + 1;
  }

  return {
    text: lines.join('\n'),
    evaluatedCount: Math.max(0, lines.length - 1)
  };
}

function dedupeItems(items) {
  const deduped = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const urlKey = typeof item.url === 'string' ? item.url.trim().replace(/\/+$/, '').toLowerCase() : '';
    const titleKey = cleanInline(item.title, 80).toLowerCase();
    const siteKey = cleanInline(item.site, 40).toLowerCase();
    const dedupeKey = urlKey || `${siteKey}::${titleKey}`;
    if (dedupeKey && seen.has(dedupeKey)) continue;
    if (dedupeKey) seen.add(dedupeKey);
    deduped.push(item);
  }
  return deduped;
}

function trimCandidateContent(item, query, maxContentChars) {
  if (!item || typeof item !== 'object' || typeof item.content !== 'string' || !item.content.trim()) {
    return item;
  }
  const cleanContent = extractMainContentExcerpt(item.content, query, maxContentChars);
  if (!cleanContent) {
    const copy = { ...item };
    delete copy.content;
    return copy;
  }
  return {
    ...item,
    content: cleanContent,
    ...(item.content.length > cleanContent.length ? { content_truncated: true } : {})
  };
}

/**
 * Evaluate and rerank search candidates with `gemini-decision-1` in a single prefill pass,
 * pruning noisy results and identifying the highest-value URLs worth full extraction.
 */
export async function rankSearchCandidatesWithDecision1(
  rawItems,
  {
    query = '',
    apiKey = '',
    fetchTop = 0,
    maxKeep = MAX_DECISION_CANDIDATES,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_DECISION_TIMEOUT_MS,
    signal
  } = {}
) {
  const deduped = dedupeItems(rawItems).map((item) => trimCandidateContent(item, query, MAX_FETCH_TOP_CONTENT_CHARS));
  if (deduped.length === 0) {
    return { items: [], fetchCandidateIndices: [], usedDecisionApi: false, prunedCount: 0 };
  }

  const normalizedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const candidates = deduped.slice(0, MAX_DECISION_CANDIDATES);

  if (!normalizedKey || candidates.length < 3 || signal?.aborted) {
    const kept = deduped.slice(0, maxKeep);
    const fetchCandidateIndices = kept
      .map((item, idx) => (item?.url && !item?.content ? idx : -1))
      .filter((idx) => idx >= 0)
      .slice(0, Math.max(0, fetchTop));
    return {
      items: kept,
      fetchCandidateIndices,
      usedDecisionApi: false,
      prunedCount: Math.max(0, deduped.length - kept.length)
    };
  }

  const { text: digestText, evaluatedCount } = buildDecisionDigest(query, candidates);
  if (evaluatedCount < 3) {
    const kept = deduped.slice(0, maxKeep);
    return {
      items: kept,
      fetchCandidateIndices: kept.map((item, idx) => (item?.url && !item?.content ? idx : -1)).filter((i) => i >= 0).slice(0, Math.max(0, fetchTop)),
      usedDecisionApi: false,
      prunedCount: 0
    };
  }

  const questions = {};
  for (let i = 0; i < evaluatedCount; i += 1) {
    questions[`s_${i}`] = {
      type: 'score',
      instructions: `Rate usefulness and credibility of [${i}] for the query.`,
      criteria: SCORE_CRITERIA
    };
  }

  if (fetchTop > 0 && evaluatedCount >= 2) {
    const criteria = {};
    for (let i = 0; i < evaluatedCount; i += 1) {
      const site = cleanInline(candidates[i]?.site, 32) || extractSiteHost(candidates[i]?.url) || 'site';
      const title = cleanInline(candidates[i]?.title, 50) || site;
      criteria[String(i)] = `[${i}] ${site}: ${title}`;
    }
    questions.best_primary = {
      type: 'choice',
      instructions: 'Pick the single most authoritative, useful candidate page to read in full.',
      criteria
    };
  }

  const requestBody = JSON.stringify({
    model: DECISION_MODEL,
    input: digestText,
    questions
  });
  const estimatedTokens = estimateTokens(requestBody);

  if (!canUseDecisionBudget(estimatedTokens)) {
    const kept = deduped.slice(0, maxKeep);
    return {
      items: kept,
      fetchCandidateIndices: kept.map((item, idx) => (item?.url && !item?.content ? idx : -1)).filter((i) => i >= 0).slice(0, Math.max(0, fetchTop)),
      usedDecisionApi: false,
      prunedCount: 0
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Decision timeout')), timeoutMs);
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetchImpl(`${DECISIONS_ENDPOINT}?key=${encodeURIComponent(normalizedKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 429) decisionCooldownUntil = Date.now() + 30_000;
      else if (response.status === 503) decisionCooldownUntil = Date.now() + 15_000;
      const kept = deduped.slice(0, maxKeep);
      return {
        items: kept,
        fetchCandidateIndices: kept.map((item, idx) => (item?.url && !item?.content ? idx : -1)).filter((i) => i >= 0).slice(0, Math.max(0, fetchTop)),
        usedDecisionApi: false,
        prunedCount: 0
      };
    }

    const data = await response.json();
    const totalTokens = Number(data?.usage?.total_input_tokens) || estimatedTokens;
    recordDecisionUsage(totalTokens);

    const answers = data?.answers && typeof data.answers === 'object' ? data.answers : null;
    if (!answers) {
      const kept = deduped.slice(0, maxKeep);
      return {
        items: kept,
        fetchCandidateIndices: kept.map((item, idx) => (item?.url && !item?.content ? idx : -1)).filter((i) => i >= 0).slice(0, Math.max(0, fetchTop)),
        usedDecisionApi: false,
        prunedCount: 0
      };
    }

    const bestPick = answers.best_primary;
    const bestIndex =
      bestPick && Number(bestPick.confidence) >= 0.45 && /^\d+$/.test(String(bestPick.choice))
        ? Number(bestPick.choice)
        : -1;

    const scoredEntries = candidates.map((item, idx) => {
      const answer = answers[`s_${idx}`];
      const rawScore = typeof answer?.score === 'number' && Number.isFinite(answer.score) ? answer.score : 2.0;
      const adjustedScore = rawScore + (idx === bestIndex ? 0.35 : 0);
      return {
        item,
        originalIndex: idx,
        rawScore,
        adjustedScore
      };
    });

    scoredEntries.sort((a, b) => b.adjustedScore - a.adjustedScore || a.originalIndex - b.originalIndex);

    const minKeepCount = Math.min(scoredEntries.length, Math.max(3, fetchTop + 1));
    const filtered = scoredEntries.filter(
      (entry, rankIdx) => rankIdx < minKeepCount || entry.rawScore >= 1.15
    );

    const remainingTail = deduped.slice(MAX_DECISION_CANDIDATES);
    const rankedItems = [
      ...filtered.map((entry) => ({
        ...entry.item,
        decision_score: Number((entry.rawScore + 1).toFixed(2))
      })),
      ...remainingTail
    ].slice(0, maxKeep);

    const fetchCandidateIndices = [];
    if (fetchTop > 0) {
      for (let i = 0; i < rankedItems.length && fetchCandidateIndices.length < fetchTop; i += 1) {
        if (rankedItems[i]?.url && !rankedItems[i]?.content) {
          fetchCandidateIndices.push(i);
        }
      }
    }

    return {
      items: rankedItems,
      fetchCandidateIndices,
      usedDecisionApi: true,
      prunedCount: Math.max(0, deduped.length - rankedItems.length)
    };
  } catch {
    const kept = deduped.slice(0, maxKeep);
    return {
      items: kept,
      fetchCandidateIndices: kept.map((item, idx) => (item?.url && !item?.content ? idx : -1)).filter((i) => i >= 0).slice(0, Math.max(0, fetchTop)),
      usedDecisionApi: false,
      prunedCount: 0
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Distill extracted text across standalone tool payloads (`fetch_url`, `wiki_page`, `research_topic`)
 * so large boilerplate/menus never enter the LLM context.
 */
export function distillToolPayloadContent(result, query = '') {
  if (!result || typeof result !== 'object' || result.ok === false) return result;

  if (typeof result.content === 'string' && result.content) {
    const clean = extractMainContentExcerpt(result.content, query || result.title || '', MAX_MAIN_CONTENT_CHARS);
    return {
      ...result,
      content: clean,
      truncated: Boolean(result.truncated || result.content.length > clean.length)
    };
  }

  return result;
}
