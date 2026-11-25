// language: JavaScript, file: server/index.js, target: Node.js / Local dev proxy
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { generateChatTitle, keyRotator, streamChatCompletion } from './llm.js';
import { applyMemoryTool } from './memory.js';
import { MAX_FACTS_PER_SCOPE } from './modelConfig.js';
import {
  cacheSpeechResult,
  synthesizeSpeech,
  synthesizeSpeechBatch,
  synthesizeSpeechStream,
  VOICES
} from './tts.js';
import {
  DEFAULT_PLAYBACK_SPEEDS,
  DEFAULT_VOICES,
  isValidVoice,
  normalizePlaybackSpeeds
} from './ttsConfig.js';
import {
  resolveIpaOnly,
  resolveTranslation,
  resolveTranscriptionAndTranslation
} from './transcribe.js';
import { closeDatabase, connectDatabase, getDatabase } from './db.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 14_000;
const MAX_TTS_CHARS = 1_200;

app.use(cors());
app.use(express.json({ limit: '64kb' }));

const SESSION_COOKIE = 'fastlearn_session';
const SESSION_DAYS = 30;

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

const SESSION_CACHE_TTL_MS = 30_000;
const sessionCache = new Map();
const pendingSessionLookups = new Map();

async function getAuthenticatedUser(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const cached = sessionCache.get(tokenHash);
  if (cached) {
    if (cached.expiresAt > Date.now()) return cached.user;
    sessionCache.delete(tokenHash);
  }

  const inFlight = pendingSessionLookups.get(tokenHash);
  if (inFlight) return inFlight;

  const lookup = (async () => {
    const db = getDatabase();
    const session = await db.collection('sessions').findOne({
      tokenHash,
      expiresAt: { $gt: new Date() }
    });
    if (!session) return null;

    const user = await db.collection('users').findOne({ googleSub: session.googleSub });
    if (user) {
      sessionCache.set(tokenHash, {
        user,
        expiresAt: Math.min(Date.now() + SESSION_CACHE_TTL_MS, new Date(session.expiresAt).getTime())
      });
    }
    return user;
  })().finally(() => {
    if (pendingSessionLookups.get(tokenHash) === lookup) {
      pendingSessionLookups.delete(tokenHash);
    }
  });

  pendingSessionLookups.set(tokenHash, lookup);
  return lookup;
}

function requireAuth(req, res, next) {
  getAuthenticatedUser(req)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: 'Sign in required' });
        return;
      }
      req.user = user;
      next();
    })
    .catch(next);
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

app.use((req, res, next) => {
  const started = Date.now();
  const id = Math.random().toString(36).slice(2, 10);

  res.on('finish', () => {
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        event: 'request',
        id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started
      })
    );
  });

  next();
});

function cleanString(value, maxChars) {
  return typeof value === 'string' ? value.trim().slice(0, maxChars) : '';
}

function cleanStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, 220))
    .filter(Boolean)
    .slice(0, MAX_FACTS_PER_SCOPE);
}

function parseMessages(value) {
  if (!Array.isArray(value)) throw new Error('messages must be an array');

  const cleaned = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
    const content = cleanString(item.content, MAX_MESSAGE_CHARS);
    if (!role || !content) continue;
    cleaned.push({ role, content });
  }

  if (cleaned.length === 0) throw new Error('At least one message is required');
  if (cleaned[cleaned.length - 1].role !== 'user') {
    throw new Error('The last message must be from the user');
  }

  const recent = cleaned.slice(-MAX_MESSAGES);
  let total = recent.reduce((sum, message) => sum + message.content.length, 0);
  while (total > MAX_TOTAL_CHARS && recent.length > 1) {
    total -= recent.shift().content.length;
  }

  return recent;
}

function parseMemories(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    global: cleanStringList(raw.global),
    da: cleanStringList(raw.da),
    en: cleanStringList(raw.en)
  };
}

async function ensureWorkspace(ownerId) {
  const db = getDatabase();
  const existing = await db.collection('workspaces').findOne({ ownerId });
  if (existing) return existing;

  const workspace = {
    ownerId,
    theme: 'dark',
    currentLanguage: 'da',
    voices: { ...DEFAULT_VOICES },
    playbackSpeeds: {
      da: [...DEFAULT_PLAYBACK_SPEEDS.da],
      en: [...DEFAULT_PLAYBACK_SPEEDS.en]
    },
    chats: [],
    messages: {},
    memories: {
      global: ['Рідна мова — українська.', 'Цінує короткі, природні відповіді без повчань і зайвих слів.'],
      da: ['Вивчає розмовну данську для повсякденного спілкування.'],
      en: ['Практикує природну англійську для роботи та подорожей.']
    },
    quota: { remaining: 30, limit: 30, resetAt: new Date(Date.now() + 15 * 60 * 60 * 1000).toISOString() },
    activeChatId: { da: null, en: null },
    updatedAt: new Date(),
    createdAt: new Date()
  };
  await db.collection('workspaces').insertOne(workspace);
  return workspace;
}

app.get('/api/auth/google/start', async (req, res, next) => {
  try {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not configured');

    const state = randomToken();
    await getDatabase().collection('oauth_states').insertOne({
      state,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      include_granted_scopes: 'true',
      state
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/google/callback', async (req, res, next) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
    if (oauthError) throw new Error(req.query.error_description || oauthError);
    if (!code || !state) throw new Error('Google returned an incomplete response');

    const db = getDatabase();
    const pending = await db.collection('oauth_states').findOne({ state, expiresAt: { $gt: new Date() } });
    if (!pending) throw new Error('Google login state is invalid or expired');
    await db.collection('oauth_states').deleteOne({ _id: pending._id });

    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenResponse.ok) throw new Error('Google could not exchange the login code');
    const tokens = await tokenResponse.json();

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!profileResponse.ok) throw new Error('Google could not load the account profile');
    const profile = await profileResponse.json();
    if (!profile.sub || !profile.email) throw new Error('Google profile is incomplete');

    const dbUser = await db.collection('users').findOneAndUpdate(
      { googleSub: profile.sub },
      {
        $set: {
          googleSub: profile.sub,
          name: profile.name || profile.email.split('@')[0],
          email: profile.email,
          avatar: profile.picture || '',
          updatedAt: new Date()
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const sessionToken = randomToken();
    await db.collection('sessions').insertOne({
      tokenHash: hashToken(sessionToken),
      googleSub: profile.sub,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
      createdAt: new Date()
    });
    await ensureWorkspace(profile.sub);
    setSessionCookie(res, sessionToken);
    const appOrigin = process.env.APP_ORIGIN || 'http://localhost:3002';
    res.redirect(appOrigin);
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.json({ user: null });
      return;
    }
    const workspace = await ensureWorkspace(user.googleSub);
    res.json({
      user: {
        id: `google_${user.googleSub}`,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        currentLanguage: workspace.currentLanguage === 'en' ? 'en' : 'da'
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const tokenHash = hashToken(token);
    sessionCache.delete(tokenHash);
    await getDatabase().collection('sessions').deleteOne({ tokenHash });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/workspace', requireAuth, async (req, res, next) => {
  try {
    const workspace = await ensureWorkspace(req.user.googleSub);
    res.json({ workspace });
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspace', requireAuth, async (req, res, next) => {
  try {
    const allowed = [
      'theme',
      'currentLanguage',
      'voices',
      'playbackSpeeds',
      'chats',
      'messages',
      'memories',
      'quota',
      'activeChatId'
    ];
    const update = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        update[key] = key === 'playbackSpeeds' ? normalizePlaybackSpeeds(req.body[key]) : req.body[key];
      }
    }
    update.updatedAt = new Date();
    await getDatabase().collection('workspaces').updateOne(
      { ownerId: req.user.googleSub },
      { $set: update },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: keyRotator.totalKeys > 0 ? 'online' : 'degraded',
    server: 'Express',
    provider: 'Google Gemini',
    models: (process.env.GEMINI_MODELS || 'gemini-flash-lite-latest,gemini-3-flash-preview,gemma-4-26b-a4b-it')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean),
    configured: keyRotator.totalKeys > 0,
    voices: VOICES
  });
});

app.post('/api/chat', requireAuth, async (req, res) => {
  let messages;
  let memories;

  try {
    messages = parseMessages(req.body?.messages);
    memories = parseMemories(req.body?.memories);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  const language = req.body?.language === 'en' ? 'en' : 'da';

  if (keyRotator.totalKeys === 0) {
    res.status(503).json({ error: 'AI is not configured. Add GEMINI_API_KEYS to .env.' });
    return;
  }

  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (payload) => {
    if (closed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    await streamChatCompletion({
      messages,
      language,
      userMemories: memories,
      enableTools: true,
      onToken: (token) => send({ token }),
      onToolCall: async (name, args) => {
        const workspace = await ensureWorkspace(req.user.googleSub);
        const result = applyMemoryTool(parseMemories(workspace.memories), name, args);
        if (result.event) {
          await getDatabase().collection('workspaces').updateOne(
            { ownerId: req.user.googleSub },
            { $set: { memories: result.memories, updatedAt: new Date() } },
            { upsert: true }
          );
        }
        if (result.event) send({ memory: result.event });
        return result.result;
      },
      onDone: () => {
        if (closed || res.writableEnded) return;
        res.write('data: [DONE]\n\n');
        res.end();
      },
      onError: (error) => {
        console.error('[chat] stream failed', error.message);
        send({ error: error.message });
        if (!res.writableEnded) res.end();
      }
    });
  } catch (error) {
    console.error('[chat] handler failed', error);
    send({ error: error.message || 'Chat request failed' });
    if (!res.writableEnded) res.end();
  }
});

function waitForResponseDrain(response) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.removeListener('drain', onDrain);
      response.removeListener('close', onClose);
      response.removeListener('error', onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Client disconnected during speech playback'));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };

    response.once('drain', onDrain);
    response.once('close', onClose);
    response.once('error', onError);
  });
}

app.get('/api/tts', requireAuth, async (req, res) => {
  const text = cleanString(req.query.text, MAX_TTS_CHARS);
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  const language = req.query.lang === 'en' ? 'en' : 'da';
  const rawSpeed = Number.parseFloat(req.query.speed ?? '1');
  const speed = Number.isFinite(rawSpeed) ? Math.max(0.4, Math.min(1.5, rawSpeed)) : 1;
  const voice = typeof req.query.voice === 'string' ? req.query.voice : null;

  if (voice && !isValidVoice(language, voice)) {
    res.status(400).json({ error: 'Unknown voice for this language' });
    return;
  }

  try {
    const started = Date.now();
    const synthesis = await synthesizeSpeechStream(text, language, speed, voice);
    const cacheable = synthesis.source !== 'bing-http' && synthesis.source !== 'google';
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', cacheable ? 'public, max-age=86400' : 'no-store');
    res.setHeader('x-fastlearn-tts-source', synthesis.source);
    const chunks = [];
    let bytes = 0;
    const onClose = () => {
      if (!res.writableEnded) synthesis.stream.destroy?.();
    };
    res.on('close', onClose);

    try {
      for await (const chunk of synthesis.stream) {
        if (res.destroyed) return;
        const buffer = Buffer.from(chunk);
        chunks.push(buffer);
        bytes += buffer.byteLength;
        if (!res.write(buffer)) {
          await waitForResponseDrain(res);
        }
      }

      if (res.destroyed) return;
      res.end();
      if (bytes > 0 && !synthesis.cached && synthesis.source === 'edge') {
        cacheSpeechResult(synthesis.cacheKey, Buffer.concat(chunks), synthesis.source);
      }

      console.log(JSON.stringify({
        at: new Date().toISOString(),
        event: 'tts_ok',
        source: synthesis.source,
        cached: synthesis.cached,
        language,
        chars: text.length,
        bytes,
        ms: Date.now() - started
      }));
    } catch (streamError) {
      if (bytes === 0 && synthesis.source === 'edge' && !res.destroyed) {
        console.warn('[tts] Edge stream failed before audio started; using fallback');
        const fallback = await synthesizeSpeech(text, language, speed, voice);
        const fallbackCacheable = fallback.source !== 'bing-http' && fallback.source !== 'google';
        res.setHeader('Cache-Control', fallbackCacheable ? 'public, max-age=86400' : 'no-store');
        res.setHeader('x-fastlearn-tts-source', fallback.source);
        res.send(fallback.buffer);
        console.log(JSON.stringify({
          at: new Date().toISOString(),
          event: 'tts_ok',
          source: fallback.source,
          cached: fallback.cached,
          language,
          chars: text.length,
          bytes: fallback.buffer.byteLength,
          ms: Date.now() - started
        }));
        return;
      }
      if (!res.destroyed) res.destroy(streamError);
    } finally {
      res.removeListener('close', onClose);
    }
  } catch (error) {
    console.error('[tts] synthesis failed', error.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Speech synthesis is unavailable right now' });
    } else if (!res.destroyed) {
      res.end();
    }
  }
});

app.post('/api/tts/batch', requireAuth, async (req, res) => {
  const text = cleanString(req.body?.text, MAX_TTS_CHARS);
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  const language = req.body?.lang === 'en' ? 'en' : 'da';
  const voice = typeof req.body?.voice === 'string' && req.body.voice.trim() ? req.body.voice.trim() : null;
  if (voice && !isValidVoice(language, voice)) {
    res.status(400).json({ error: 'Unknown voice for this language' });
    return;
  }

  const speeds = Array.isArray(req.body?.speeds) ? req.body.speeds : [1, 0.7, 0.5];
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const failed = await synthesizeSpeechBatch(text, language, speeds, voice, async ({ speed, buffer, source }) => {
      if (res.destroyed) return;
      const line = JSON.stringify({
        speed,
        audioBase64: Buffer.from(buffer).toString('base64'),
        source
      });
      res.write(`${line}\n`);
    });

    for (const speed of failed) {
      if (res.destroyed) break;
      res.write(`${JSON.stringify({ speed, error: 'Speech synthesis is unavailable right now' })}\n`);
    }
  } catch (error) {
    console.error('[tts] batch synthesis failed', error.message);
  } finally {
    if (!res.destroyed) res.end();
  }
});

app.post('/api/transcribe', requireAuth, async (req, res) => {
  const text = cleanString(req.body?.text, 500);
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  if (req.body?.lang !== 'da' && req.body?.lang !== 'en') {
    res.status(400).json({ error: 'lang must be "da" or "en"' });
    return;
  }

  const userLang =
    typeof req.body?.userLang === 'string' && /^[a-z]{2}$/.test(req.body.userLang)
      ? req.body.userLang
      : 'uk';

  try {
    const result = await resolveTranscriptionAndTranslation(text, req.body.lang, userLang);
    res.json(result);
  } catch (error) {
    console.error('[transcribe] failed', error.message);
    res.status(502).json({ error: error.message || 'Translation is unavailable right now' });
  }
});

app.post('/api/translate', requireAuth, async (req, res) => {
  const text = cleanString(req.body?.text, 500);
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  if (req.body?.lang !== 'da' && req.body?.lang !== 'en') {
    res.status(400).json({ error: 'lang must be "da" or "en"' });
    return;
  }

  const userLang =
    typeof req.body?.userLang === 'string' && /^[a-z]{2}$/.test(req.body.userLang)
      ? req.body.userLang
      : 'uk';
  try {
    const translation = await resolveTranslation(text, req.body.lang, userLang);
    res.json({ original: text, translation, sourceLang: req.body.lang, userLang });
  } catch (error) {
    console.error('[translate] failed', error.message);
    res.status(502).json({ error: error.message || 'Translation is unavailable right now' });
  }
});

app.post('/api/ipa', requireAuth, async (req, res) => {
  const text = cleanString(req.body?.text, 500);
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  if (req.body?.lang !== 'da' && req.body?.lang !== 'en') {
    res.status(400).json({ error: 'lang must be "da" or "en"' });
    return;
  }

  try {
    const ipa = await resolveIpaOnly(text, req.body.lang);
    res.json({ ipa, sourceLang: req.body.lang });
  } catch (error) {
    console.error('[ipa] lookup failed', error.message);
    res.status(502).json({ error: error.message || 'Pronunciation is unavailable right now' });
  }
});

app.post('/api/title', requireAuth, async (req, res) => {
  const message = cleanString(req.body?.message, 500);
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const language = req.body?.language === 'en' ? 'en' : 'da';

  try {
    const title = await generateChatTitle({ message, language });
    res.json({ title });
  } catch (error) {
    console.error('[title] failed', error.message);
    const fallback = message.slice(0, 35).trim();
    res.json({ title: fallback.charAt(0).toUpperCase() + fallback.slice(1) });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, _req, res, _next) => {
  console.error('[server] unhandled error', error);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(error.status || 500).json({ error: error.message || 'Unexpected server error' });
});

async function start() {
  await connectDatabase();
  console.log('[FastLearn] MongoDB connected');

  const server = app.listen(PORT, () => {
    console.log(`[FastLearn] local API listening on http://localhost:${PORT}`);
    if (keyRotator.totalKeys === 0) {
      console.warn('[FastLearn] GEMINI_API_KEYS is empty — /api/chat will return 503');
    }
  });

  server.on('error', (error) => {
    console.error('[FastLearn] server error', error);
  });

  const shutdown = async () => {
    server.close();
    await closeDatabase();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('[FastLearn] startup failed', error);
  process.exit(1);
});
