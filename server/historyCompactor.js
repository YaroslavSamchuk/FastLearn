// language: JavaScript, file: server/historyCompactor.js, target: Node.js & Cloudflare Workers

import { extractSiteHost } from './searchRouter.js';

export const MAX_COMPACT_SOURCES = 15;
export const DETAILED_ASSISTANT_TURNS = 2;
export const MAX_CHAT_HISTORY_MESSAGES = 15;

export function sanitizeTimeZone(timeZone) {
  if (typeof timeZone !== 'string') return 'UTC';
  const cleaned = timeZone.trim().slice(0, 80);
  if (!cleaned) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: cleaned });
    return cleaned;
  } catch {
    return 'UTC';
  }
}

export function sanitizeCreatedAt(value) {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().slice(0, 40);
  if (!cleaned) return undefined;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function formatMessageTimestamp(createdAt, timeZone = 'UTC') {
  if (!createdAt) return '';
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  const resolvedTz = sanitizeTimeZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short'
    }).formatToParts(date);

    const byType = Object.create(null);
    for (const part of parts) {
      byType[part.type] = part.value;
    }
    if (byType.year && byType.month && byType.day && byType.hour && byType.minute) {
      const tzLabel = byType.timeZoneName ? ` ${byType.timeZoneName}` : '';
      const weekday = byType.weekday ? `${byType.weekday} ` : '';
      return `[${weekday}${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}${tzLabel}]`;
    }
  } catch {
    // fallback to UTC ISO below
  }

  return `[${date.toISOString().slice(0, 16).replace('T', ' ')} UTC]`;
}

/**
 * Build chronological chat turns (up to 15 messages) with compact source notes
 * and per-message date/time prefixes for model orientation.
 */
export function buildChatContextTurns(
  messages,
  {
    language = 'da',
    timeZone = 'UTC',
    lockLatestMessage,
    maxMessages = MAX_CHAT_HISTORY_MESSAGES,
    nowIso = new Date().toISOString()
  } = {}
) {
  const windowMessages = Array.isArray(messages) ? messages.slice(-maxMessages) : [];
  let assistantSeenFromEnd = 0;
  const assistantAges = new Array(windowMessages.length).fill(0);
  for (let i = windowMessages.length - 1; i >= 0; i -= 1) {
    if (windowMessages[i]?.role === 'assistant') {
      assistantSeenFromEnd += 1;
      assistantAges[i] = assistantSeenFromEnd;
    }
  }

  const latestIndex = windowMessages.length - 1;
  return windowMessages.map((message, index) => {
    const isLatestUser = message.role === 'user' && index === latestIndex;
    const rawTime = message.createdAt || (isLatestUser ? nowIso : undefined);
    const stamp = formatMessageTimestamp(rawTime, timeZone);

    let text;
    if (message.role === 'assistant') {
      const withSources = formatAssistantContextWithSources(
        message.content,
        message.sources,
        assistantAges[index] || 1
      );
      text = stamp ? `${stamp}\n${withSources}` : withSources;
    } else if (isLatestUser) {
      const stamped = stamp ? `${stamp}\n${message.content}` : message.content;
      text = typeof lockLatestMessage === 'function' ? lockLatestMessage(stamped, language) : stamped;
    } else {
      text = stamp ? `${stamp}\n${message.content}` : message.content;
    }

    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    };
  });
}

function cleanText(value, maxChars) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxChars) : '';
}

function pushSourceItem(target, seen, rawItem, defaultNote = '') {
  if (!rawItem || typeof rawItem !== 'object') return;
  const url = cleanText(rawItem.url, 240);
  const site = cleanText(rawItem.site, 48) || extractSiteHost(url) || cleanText(rawItem.source, 32);
  const title = cleanText(rawItem.title, 80);
  const note = cleanText(rawItem.snippet || rawItem.description || defaultNote, 100);
  if (!site && !title && !url) return;

  const key = url || `${site}::${title.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);

  const entry = {
    site: site || 'web',
    title: title || site || url
  };
  if (url) entry.url = url;
  if (note) entry.note = note;
  target.push(entry);
}

/**
 * Extract a compact deduplicated list of sources (site, title, url, short note) from tool outputs.
 */
export function extractSearchDigest(batchResults, maxItems = MAX_COMPACT_SOURCES) {
  const items = [];
  const seen = new Set();

  for (const res of Array.isArray(batchResults) ? batchResults : []) {
    if (!res || typeof res !== 'object' || res.ok === false) continue;

    if (Array.isArray(res.results)) {
      for (const r of res.results) {
        pushSourceItem(items, seen, r);
        if (items.length >= maxItems) return items;
      }
    }
    if (Array.isArray(res.wikipedia)) {
      for (const r of res.wikipedia) {
        pushSourceItem(items, seen, r);
        if (items.length >= maxItems) return items;
      }
    }
    if (Array.isArray(res.wikidata)) {
      for (const r of res.wikidata) {
        pushSourceItem(items, seen, r);
        if (items.length >= maxItems) return items;
      }
    }
    if (res.web && Array.isArray(res.web.results)) {
      for (const r of res.web.results) {
        pushSourceItem(items, seen, r);
        if (items.length >= maxItems) return items;
      }
    }
    if (res.facts && Array.isArray(res.facts.wikipedia)) {
      for (const r of res.facts.wikipedia) {
        pushSourceItem(items, seen, r);
        if (items.length >= maxItems) return items;
      }
    }
    if (res.news && Array.isArray(res.news.results)) {
      for (const r of res.news.results) {
        pushSourceItem(items, seen, r);
        if (items.length >= maxItems) return items;
      }
    }
    if (res.title || res.url) {
      pushSourceItem(items, seen, res, res.content ? String(res.content).slice(0, 100) : '');
      if (items.length >= maxItems) return items;
    }
  }

  return items;
}

/**
 * Sanitize persisted source metadata; strips notes/URLs when `compactOnly` is enabled.
 */
export function sanitizeMessageSources(
  rawSources,
  { compactOnly = false, maxItems = MAX_COMPACT_SOURCES } = {}
) {
  if (!Array.isArray(rawSources)) return [];
  const out = [];
  const seen = new Set();

  for (const item of rawSources) {
    if (!item || typeof item !== 'object') continue;
    const site = cleanText(item.site, 48);
    const title = cleanText(item.title, 80);
    if (!site && !title) continue;

    const dedupeKey = `${site}::${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (compactOnly) {
      out.push({ site: site || 'web', title: title || site });
    } else {
      const url = cleanText(item.url, 240);
      const note = cleanText(item.note, 100);
      out.push({
        site: site || 'web',
        title: title || site,
        ...(url ? { url } : {}),
        ...(note ? { note } : {})
      });
    }
    if (out.length >= maxItems) break;
  }

  return out;
}

/**
 * Compact search sources on persisted chat messages older than the last 2 assistant turns.
 */
export function compactMessagesSources(messages, keepDetailedTurns = DETAILED_ASSISTANT_TURNS) {
  if (!Array.isArray(messages)) return [];

  let assistantSeenFromEnd = 0;
  const result = new Array(messages.length);

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object') {
      result[i] = msg;
      continue;
    }

    if (msg.role === 'assistant') {
      assistantSeenFromEnd += 1;
      const isOld = assistantSeenFromEnd > keepDetailedTurns;
      if (Array.isArray(msg.sources) && msg.sources.length > 0) {
        const cleaned = sanitizeMessageSources(msg.sources, { compactOnly: isOld });
        result[i] = cleaned.length > 0 ? { ...msg, sources: cleaned } : { ...msg };
        if (cleaned.length === 0) delete result[i].sources;
      } else {
        result[i] = msg;
      }
      continue;
    }

    result[i] = msg;
  }

  return result;
}

/**
 * Format an assistant message with compact source context for the LLM.
 * Recent turns (last 2 assistant replies) keep site + title + short note;
 * older turns (>2nd message back) keep only site names and titles.
 */
export function formatAssistantContextWithSources(content, sources, assistantAgeFromEnd) {
  if (!Array.isArray(sources) || sources.length === 0) return content;
  const compactOnly = assistantAgeFromEnd > DETAILED_ASSISTANT_TURNS;
  const cleaned = sanitizeMessageSources(sources, { compactOnly });
  if (cleaned.length === 0) return content;

  if (compactOnly) {
    const summary = cleaned.map((s) => `${s.site} (${s.title})`).join('; ');
    return `${content}\n\n[Earlier sources: ${summary}]`;
  }

  const summary = cleaned
    .map((s) => (s.note ? `${s.site} — ${s.title}: ${s.note}` : `${s.site} — ${s.title}`))
    .join(' | ');
  return `${content}\n\n[Checked sources: ${summary}]`;
}

function compactResultArray(items, limit = 6) {
  if (!Array.isArray(items)) return undefined;
  return items.slice(0, limit).map((item) => ({
    site: cleanText(item?.site, 48) || extractSiteHost(item?.url),
    title: cleanText(item?.title, 80),
    ...(item?.url ? { url: cleanText(item.url, 200) } : {}),
    ...(item?.snippet ? { snippet: cleanText(item.snippet, 120) } : {})
  }));
}

/**
 * Shrink earlier-round tool payloads inside `activeContents` so multi-round loops stay lightweight
 * while preserving full details for the latest round.
 */
export function compactEarlierRoundToolResult(result) {
  if (!result || typeof result !== 'object') return result;
  if (result.compacted) return result;

  const summary = {
    compacted: true,
    ok: Boolean(result.ok),
    ...(result.query ? { query: cleanText(result.query, 160) } : {}),
    ...(result.title ? { title: cleanText(result.title, 80) } : {}),
    ...(result.site ? { site: cleanText(result.site, 48) } : {}),
    ...(result.url ? { url: cleanText(result.url, 200) } : {}),
    ...(result.budget_remaining ? { budget_remaining: result.budget_remaining } : {})
  };

  if (Array.isArray(result.results)) summary.results = compactResultArray(result.results, 6);
  if (Array.isArray(result.wikipedia)) summary.wikipedia = compactResultArray(result.wikipedia, 3);
  if (Array.isArray(result.wikidata)) summary.wikidata = compactResultArray(result.wikidata, 2);
  if (result.web?.results) summary.web_results = compactResultArray(result.web.results, 4);
  if (result.news?.results) summary.news_results = compactResultArray(result.news.results, 3);
  if (typeof result.content === 'string' && result.content) {
    summary.excerpt = cleanText(result.content, 200);
  }
  return summary;
}

/**
 * Compact `functionResponse` parts in turns older than the most recent tool-response turn.
 */
export function compactActiveContentsToolHistory(activeContents) {
  if (!Array.isArray(activeContents) || activeContents.length <= 2) return activeContents;

  // Leave the most recent user tool-response turn intact; compact any older tool-response turns.
  let seenLatestToolResponseTurn = false;
  const compacted = activeContents.slice();

  for (let i = compacted.length - 1; i >= 0; i -= 1) {
    const turn = compacted[i];
    if (!turn || turn.role !== 'user' || !Array.isArray(turn.parts)) continue;
    const hasFnResponse = turn.parts.some(
      (part) => part && typeof part === 'object' && 'functionResponse' in part
    );
    if (!hasFnResponse) continue;

    if (!seenLatestToolResponseTurn) {
      seenLatestToolResponseTurn = true;
      continue;
    }

    compacted[i] = {
      ...turn,
      parts: turn.parts.map((part) => {
        if (!part || typeof part !== 'object' || !part.functionResponse) return part;
        const fnResp = part.functionResponse;
        return {
          functionResponse: {
            ...fnResp,
            response: {
              result: compactEarlierRoundToolResult(fnResp.response?.result)
            }
          }
        };
      })
    };
  }

  return compacted;
}
