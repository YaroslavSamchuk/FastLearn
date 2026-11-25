// language: JavaScript, file: server/ttsProviders.js, target: Web-standard (Cloudflare Workers + Node.js)

export const EDGE_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
export const EDGE_OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';

export const EDGE_AGENT_PROFILES = [
  {
    id: 'win-edge-143',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    secMsGecVersion: '2-143.0.3650.96',
    acceptLanguage: 'en-US,en;q=0.9'
  },
  {
    id: 'mac-edge-143',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    secMsGecVersion: '2-143.0.3650.75',
    acceptLanguage: 'da-DK,da;q=0.9,en;q=0.8'
  },
  {
    id: 'linux-edge-143',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    secMsGecVersion: '2-143.0.3650.96',
    acceptLanguage: 'en-GB,en;q=0.9'
  },
  {
    id: 'android-edge-143',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36 EdgA/143.0.3650.96',
    secMsGecVersion: '2-143.0.3650.96',
    acceptLanguage: 'da,en-US;q=0.9,en;q=0.8'
  },
  {
    id: 'win-edge-142',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
    secMsGecVersion: '2-142.0.3595.94',
    acceptLanguage: 'uk,en-US;q=0.9,en;q=0.8'
  },
  {
    id: 'win-edge-144',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
    secMsGecVersion: '2-144.0.3719.82',
    acceptLanguage: 'en-US,en;q=0.9'
  }
];

export const EDGE_CHROMIUM_VERSION = '143.0.3650.96';
export const EDGE_SEC_MS_GEC_VERSION = EDGE_AGENT_PROFILES[0].secMsGecVersion;
export const EDGE_USER_AGENT = EDGE_AGENT_PROFILES[0].userAgent;

const EDGE_COPYRIGHT = 'Copyright (C) Microsoft Corporation. All rights reserved.';
const SWAP_FIRST_WORD = { swappedWord: 0xef0569fb, swappedSum: 0x76f50f34, swappedProduct: 0xc3efea97 };
const SWAP_SECOND_WORD = { swappedWord: 0xc31713db, swappedSum: 0x1881ce3c, swappedProduct: 0x35bd1ec9 };
const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];
const BING_SESSION_TTL_MS = 8 * 60 * 1000;
const AGENT_COOLDOWN_MS = 60 * 1000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const bingSessions = new Map();
const bingSessionInflight = new Map();
const agentCooldowns = new Map();
let nextAgentCursor = 0;

function cooldownKey(endpoint, agentId) {
  return `${endpoint}:${agentId}`;
}

export function markAgentCooldown(endpoint, agentId, ttlMs = AGENT_COOLDOWN_MS) {
  agentCooldowns.set(cooldownKey(endpoint, agentId), Date.now() + ttlMs);
}

export function isAgentInCooldown(endpoint, agentId) {
  const until = agentCooldowns.get(cooldownKey(endpoint, agentId));
  if (!until) return false;
  if (Date.now() >= until) {
    agentCooldowns.delete(cooldownKey(endpoint, agentId));
    return false;
  }
  return true;
}

export function hasHealthyAgent(endpoint) {
  return EDGE_AGENT_PROFILES.some((profile) => !isAgentInCooldown(endpoint, profile.id));
}

export function pickEdgeAgent(endpoint = 'bing', excludeIds = new Set()) {
  const count = EDGE_AGENT_PROFILES.length;
  const start = nextAgentCursor % count;
  nextAgentCursor = (nextAgentCursor + 1) % count;

  let fallback = null;
  for (let offset = 0; offset < count; offset += 1) {
    const candidate = EDGE_AGENT_PROFILES[(start + offset) % count];
    if (excludeIds.has(candidate.id)) continue;
    if (!isAgentInCooldown(endpoint, candidate.id)) return candidate;
    if (!fallback) fallback = candidate;
  }

  return fallback ?? EDGE_AGENT_PROFILES[start];
}

function generateMuid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toUpperHex(bytes);
}

function swapHalves(value) {
  return ((value << 16) | (value >>> 16)) >>> 0;
}

function swapTerm(word, key, multipliers) {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), multipliers.swappedWord);
  const product = Math.imul(swapHalves(sum), multipliers.swappedSum) >>> 0;
  return (Math.imul(swapHalves(product), multipliers.swappedProduct) + product) >>> 0;
}

function swapAndMultiply(value, multipliers) {
  let result = value;
  for (const multiplier of multipliers) {
    result = Math.imul(swapHalves(result), multiplier) >>> 0;
  }
  return result;
}

function cs64(message, digest) {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
  const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;
  const padded = new Uint8Array(Math.ceil(message.length / 8) * 8);
  padded.set(message);
  const words = new DataView(padded.buffer);

  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;

  for (let offset = 0; offset < padded.length; offset += 8) {
    const firstWord = words.getUint32(offset, true);
    const secondWord = words.getUint32(offset + 4, true);
    const firstSwap = swapTerm(firstWord, firstKey, SWAP_FIRST_WORD);
    lastSwap = swapTerm(secondWord, secondKey, SWAP_SECOND_WORD);
    swapSum = (swapSum + firstSwap + lastSwap) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + firstWord, firstKey), MIX_FIRST_WORD);
    mixSum = (mixSum + mix) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + secondWord, secondKey), MIX_SECOND_WORD);
    mixSum = (mixSum + mix) >>> 0;
  }

  const checksum = new Uint8Array(8);
  const checksumView = new DataView(checksum.buffer);
  checksumView.setUint32(0, lastSwap ^ mix, true);
  checksumView.setUint32(4, swapSum ^ mixSum, true);
  return checksum;
}

function toUpperHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

export async function hashSecMsGecV2(ticksAndToken) {
  const message = textEncoder.encode(EDGE_COPYRIGHT + ticksAndToken);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', message));
  return `${toUpperHex(cs64(message, digest))}-${toUpperHex(digest)}`;
}

export async function generateSecMsGec(clockOffsetMs = 0) {
  const ticks = Math.floor((Date.now() + clockOffsetMs) / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  return hashSecMsGecV2(`${windowsTicks}${EDGE_TRUSTED_CLIENT_TOKEN}`);
}

export function generateRequestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < bytes.length; i += 1) {
    id += bytes[i].toString(16).padStart(2, '0');
  }
  return id;
}

export async function buildEdgeWsUrl(
  endpoint = 'bing',
  clockOffsetMs = 0,
  secMsGecVersion = EDGE_SEC_MS_GEC_VERSION
) {
  const secMsGec = await generateSecMsGec(clockOffsetMs);
  const connId = crypto.randomUUID();
  const base =
    endpoint === 'apim'
      ? `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=${EDGE_TRUSTED_CLIENT_TOKEN}`
      : `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}`;
  return `${base}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${secMsGecVersion}&ConnectionId=${connId}`;
}

export async function buildEdgeWsConnection(endpoint = 'bing', clockOffsetMs = 0, excludeIds = new Set()) {
  const agent = pickEdgeAgent(endpoint, excludeIds);
  const url = await buildEdgeWsUrl(endpoint, clockOffsetMs, agent.secMsGecVersion);
  return {
    agent,
    url,
    headers: {
      Upgrade: 'websocket',
      'User-Agent': agent.userAgent,
      Origin: EDGE_ORIGIN,
      'Accept-Language': agent.acceptLanguage,
      Cookie: `muid=${generateMuid()};`,
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache'
    }
  };
}

export function escapeSsmlText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatSsmlRate(speed) {
  const parsed = Number.parseFloat(speed);
  const clamped = Number.isFinite(parsed) ? Math.max(0.4, Math.min(1.4, parsed)) : 1;
  const pct = Math.round((clamped - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

export function buildSpeechConfigMessage(outputFormat = EDGE_OUTPUT_FORMAT) {
  const ts = new Date().toISOString();
  const payload = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: 'false',
            wordBoundaryEnabled: 'false'
          },
          outputFormat
        }
      }
    }
  });
  return `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${payload}`;
}

export function buildEdgeSsmlMessage(requestId, text, voice, speed) {
  const ts = new Date().toISOString();
  const locale = /^[a-z]{2,}-[A-Z]{2}/.exec(voice)?.[0] ?? 'en-US';
  const safeText = escapeSsmlText(text);
  const rate = formatSsmlRate(speed);
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'><voice name='${voice}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${safeText}</prosody></voice></speak>`;
  return `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`;
}

export function parseEdgeBinaryAudioFrame(data) {
  let bytes;
  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else {
    return null;
  }

  if (bytes.byteLength < 2) return null;
  const headerLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0, false);
  if (2 + headerLen > bytes.byteLength) return null;

  const header = textDecoder.decode(bytes.subarray(2, 2 + headerLen));
  if (!header.includes('Path:audio')) return null;

  const requestId = /X-RequestId:([^\r\n]+)/.exec(header)?.[1]?.trim();
  if (!requestId) return null;

  const audio = bytes.subarray(2 + headerLen);
  return audio.byteLength > 0 ? { requestId, audio } : null;
}

export function concatUint8Arrays(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function readResponseCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');
  }
  const single = headers.get('set-cookie');
  if (!single) return '';
  return single
    .split(/,(?=[^;,\s]+=)/g)
    .map((entry) => entry.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function fetchBingSession(agent, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://www.bing.com/translator', {
      headers: {
        'User-Agent': agent.userAgent,
        'Accept-Language': agent.acceptLanguage
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Bing translator returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const abuseMatch = /params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)",\d+\]/.exec(html);
    const ig = /IG:"([^"]+)"/.exec(html)?.[1];
    const iid = /data-iid="([^"]+)"/.exec(html)?.[1] || 'translator.5024';

    if (!abuseMatch || !ig) {
      throw new Error('Bing translator did not provide TTS session tokens');
    }

    return {
      key: abuseMatch[1],
      token: abuseMatch[2],
      ig,
      iid,
      cookies: readResponseCookies(response.headers),
      expiresAt: Date.now() + BING_SESSION_TTL_MS
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getBingSession(agent, forceRefresh = false) {
  const existing = bingSessions.get(agent.id);
  if (!forceRefresh && existing && Date.now() < existing.expiresAt) {
    return existing;
  }
  if (forceRefresh) bingSessions.delete(agent.id);

  let inflight = bingSessionInflight.get(agent.id);
  if (!inflight) {
    inflight = fetchBingSession(agent)
      .then((session) => {
        bingSessions.set(agent.id, session);
        return session;
      })
      .finally(() => {
        bingSessionInflight.delete(agent.id);
      });
    bingSessionInflight.set(agent.id, inflight);
  }

  return inflight;
}

export async function synthesizeBingTranslatorTts(text, voice, speed, timeoutMs = 6_000) {
  const locale = /^[a-z]{2,}-[A-Z]{2}/.exec(voice)?.[0] ?? 'en-US';
  const safeText = escapeSsmlText(text);
  const rate = formatSsmlRate(speed);
  const ssml = `<speak version='1.0' xml:lang='${locale}'><voice xml:lang='${locale}' name='${voice}'><prosody rate='${rate}'>${safeText}</prosody></voice></speak>`;
  const triedAgents = new Set();
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const agent = pickEdgeAgent('bing-http', triedAgents);
    triedAgents.add(agent.id);

    try {
      const session = await getBingSession(agent, attempt > 1);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body = new URLSearchParams({
          ssml,
          token: session.token,
          key: session.key
        }).toString();

        const response = await fetch(
          `https://www.bing.com/tfettts?isVertical=1&&IG=${encodeURIComponent(session.ig)}&IID=${encodeURIComponent(session.iid)}.1`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': agent.userAgent,
              'Accept-Language': agent.acceptLanguage,
              Referer: 'https://www.bing.com/translator',
              ...(session.cookies ? { Cookie: session.cookies } : {})
            },
            body,
            signal: controller.signal
          }
        );

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('audio')) {
          bingSessions.delete(agent.id);
          if (response.status === 403 || response.status === 429) {
            markAgentCooldown('bing-http', agent.id);
          }
          throw new Error(`Bing TTS failed with HTTP ${response.status} (${contentType || 'unknown'})`);
        }

        const audio = new Uint8Array(await response.arrayBuffer());
        if (audio.byteLength === 0) {
          bingSessions.delete(agent.id);
          throw new Error('Bing TTS returned an empty audio stream');
        }

        return audio;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      bingSessions.delete(agent.id);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('did not provide TTS session tokens') || msg.includes('HTTP 403') || msg.includes('HTTP 429')) {
        markAgentCooldown('bing-http', agent.id);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Bing TTS synthesis failed');
}
