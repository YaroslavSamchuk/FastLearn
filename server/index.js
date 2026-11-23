import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getDb, ObjectId } from './db.js';
import { synthesizeEdgeSpeech, VOICES } from './tts.js';
import { resolveTranscriptionAndTranslation } from './transcribe.js';
import { streamChatCompletion } from './llm.js';

dotenv.config();

// Prevent any unhandled errors from terminating server
process.on('uncaughtException', (err) => {
  console.warn('[Uncaught Exception caught]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Unhandled Rejection caught]', reason);
});

const app = express();
const PORT = process.env.PORT || 3001;
const DAILY_LIMIT = 30;
const RESET_WINDOW_HOURS = 15; // User specified e.g. 15 hours cycle

app.use(cors());
app.use(express.json());

// Helper to check and reset daily quota
function evaluateDailyQuota(user) {
  const now = Date.now();
  const resetAt = user.resetAt ? new Date(user.resetAt).getTime() : 0;

  if (now >= resetAt || !user.resetAt) {
    const nextReset = new Date(now + RESET_WINDOW_HOURS * 3600 * 1000);
    return {
      messagesRemaining: DAILY_LIMIT,
      dailyLimit: DAILY_LIMIT,
      resetAt: nextReset.toISOString()
    };
  }

  return {
    messagesRemaining: typeof user.messagesRemaining === 'number' ? user.messagesRemaining : DAILY_LIMIT,
    dailyLimit: DAILY_LIMIT,
    resetAt: user.resetAt
  };
}

// Default user
const DEFAULT_USER = {
  id: 'usr_yaroslav_01',
  name: 'Yaroslav Samchuk',
  email: 'samchukyaroslav@gmail.com',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
  currentLanguage: 'da',
  voicePreferences: {
    da: 'da-DK-ChristelNeural',
    en: 'en-US-JennyNeural'
  },
  messagesRemaining: DAILY_LIMIT,
  dailyLimit: DAILY_LIMIT,
  resetAt: new Date(Date.now() + RESET_WINDOW_HOURS * 3600 * 1000).toISOString(),
  memories: {
    global: [
      'Звати Ярослав (Yaroslav Samchuk). Рідна мова — українська.',
      'Цінує стислість, природність, живий дружній тон без води та повчань.',
      'Працює з технологіями та розробкою програмного забезпечення.'
    ],
    da: [
      'Вивчає розмовну данську мову (Dansk) для повсякденного життя та спілкування.',
      'Фокус на природному копенгагенському сленгу, зв\'язному мовленні та коротких фразах.'
    ],
    en: [
      'Вільне повсякденне та ділове спілкування англійською.',
      'Фокус на природних сучасних ідіомах та невимушеному листуванні.'
    ]
  }
};

// 1. Health & Config
app.get('/api/health', async (req, res) => {
  let dbStatus = 'ok';
  try {
    await getDb();
  } catch (e) {
    dbStatus = e.message;
  }
  res.json({
    status: 'online',
    database: dbStatus,
    provider: 'Google Gemma 4 31B (Fallback: Gemma 4 26B A4B)',
    supportedLanguages: ['da', 'en'],
    voices: VOICES
  });
});

// 2. User & Preferences & Daily Quota
app.get('/api/user', async (req, res) => {
  try {
    const email = req.query.email;
    const db = await getDb();
    let user = null;
    if (email) {
      user = await db.collection('users').findOne({ email });
    }
    if (!user) {
      user = await db.collection('users').findOne({ id: DEFAULT_USER.id });
    }
    if (!user) {
      await db.collection('users').insertOne(DEFAULT_USER);
      user = DEFAULT_USER;
    } else if (!user.memories) {
      // Backfill default memories if missing
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { memories: DEFAULT_USER.memories } }
      );
      user.memories = DEFAULT_USER.memories;
    }

    const quota = evaluateDailyQuota(user);
    if (quota.resetAt !== user.resetAt || quota.messagesRemaining !== user.messagesRemaining) {
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: quota }
      );
      user = { ...user, ...quota };
    }

    res.json(user);
  } catch (e) {
    res.json(DEFAULT_USER);
  }
});

// Google OAuth Login / Sync
app.post('/api/auth/google', async (req, res) => {
  try {
    const { id, name, email, avatar } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const db = await getDb();
    let user = await db.collection('users').findOne({ email });
    if (!user) {
      user = {
        id: id ? `google_${id}` : `usr_${Date.now()}`,
        name: name || 'Google User',
        email: email,
        avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
        currentLanguage: 'da',
        voicePreferences: {
          da: 'da-DK-ChristelNeural',
          en: 'en-US-JennyNeural'
        },
        messagesRemaining: DAILY_LIMIT,
        dailyLimit: DAILY_LIMIT,
        resetAt: new Date(Date.now() + RESET_WINDOW_HOURS * 3600 * 1000).toISOString(),
        memories: {
          global: [
            `Звати ${name || 'користувач'}. Рідна мова — українська.`,
            'Цінує стислість, природність, живий дружній тон без води та повчань.'
          ],
          da: [
            'Вивчає розмовну данську мову (Dansk) для повсякденного життя та спілкування.'
          ],
          en: [
            'Вільне повсякденне та ділове спілкування англійською.'
          ]
        }
      };
      await db.collection('users').insertOne(user);
    } else {
      const updateFields = {};
      if (avatar && avatar !== user.avatar) updateFields.avatar = avatar;
      if (name && name !== user.name) updateFields.name = name;
      if (Object.keys(updateFields).length > 0) {
        await db.collection('users').updateOne({ _id: user._id }, { $set: updateFields });
        user = { ...user, ...updateFields };
      }
    }

    const quota = evaluateDailyQuota(user);
    if (quota.resetAt !== user.resetAt || quota.messagesRemaining !== user.messagesRemaining) {
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: quota }
      );
      user = { ...user, ...quota };
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Memory Endpoints: Global and Per-Language Memory
app.get('/api/user/memory', async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ id: DEFAULT_USER.id });
    res.json(user?.memories || DEFAULT_USER.memories);
  } catch (e) {
    res.json(DEFAULT_USER.memories);
  }
});

app.post('/api/user/memory', async (req, res) => {
  const { scope = 'global', fact } = req.body;
  if (!fact || !fact.trim()) {
    return res.status(400).json({ error: 'Fact content is required' });
  }
  const validScope = ['global', 'da', 'en'].includes(scope) ? scope : 'global';
  try {
    const db = await getDb();
    await db.collection('users').updateOne(
      { id: DEFAULT_USER.id },
      { $push: { [`memories.${validScope}`]: fact.trim() } },
      { upsert: true }
    );
    res.json({ success: true, scope: validScope, fact: fact.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/user/memory', async (req, res) => {
  const { scope = 'global', index } = req.body;
  const validScope = ['global', 'da', 'en'].includes(scope) ? scope : 'global';
  if (typeof index !== 'number') {
    return res.status(400).json({ error: 'Valid index is required' });
  }
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ id: DEFAULT_USER.id });
    const currentList = user?.memories?.[validScope] || [];
    if (index >= 0 && index < currentList.length) {
      currentList.splice(index, 1);
      await db.collection('users').updateOne(
        { id: DEFAULT_USER.id },
        { $set: { [`memories.${validScope}`]: currentList } }
      );
    }
    res.json({ success: true, memories: currentList });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/user', async (req, res) => {
  try {
    const { currentLanguage, voicePreferences } = req.body;
    const db = await getDb();
    const update = {};
    if (currentLanguage) update.currentLanguage = currentLanguage;
    if (voicePreferences) update.voicePreferences = voicePreferences;
    
    await db.collection('users').updateOne(
      { id: DEFAULT_USER.id },
      { $set: update },
      { upsert: true }
    );
    res.json({ success: true, update });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Chats (Segregated by Language)
app.get('/api/chats', async (req, res) => {
  const language = req.query.language || 'da';
  try {
    const db = await getDb();
    const chats = await db.collection('chats')
      .find({ userId: DEFAULT_USER.id, language })
      .sort({ updatedAt: -1 })
      .toArray();
    res.json(chats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chats', async (req, res) => {
  const { language = 'da', title } = req.body;
  try {
    const db = await getDb();
    const defaultTitle = language === 'da' ? 'Ny samtale' : 'New conversation';
    const newChat = {
      userId: DEFAULT_USER.id,
      language,
      title: title || defaultTitle,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection('chats').insertOne(newChat);
    res.json({ ...newChat, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/chats/:id', async (req, res) => {
  try {
    const db = await getDb();
    const chatId = req.params.id;
    await db.collection('chats').deleteOne({ _id: new ObjectId(chatId) });
    await db.collection('messages').deleteMany({ chatId });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Messages
app.get('/api/chats/:id/messages', async (req, res) => {
  try {
    const db = await getDb();
    const chatId = req.params.id;
    const messages = await db.collection('messages')
      .find({ chatId })
      .sort({ createdAt: 1 })
      .toArray();
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. Send message & Stream AI completion (Enforcing Daily Limit)
app.post('/api/chats/:id/messages', async (req, res) => {
  const chatId = req.params.id;
  const { content, language = 'da' } = req.body;
  
  if (!content?.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    const db = await getDb();
    let user = await db.collection('users').findOne({ id: DEFAULT_USER.id });
    if (!user) user = DEFAULT_USER;

    const quota = evaluateDailyQuota(user);

    // Enforce quota
    if (quota.messagesRemaining <= 0) {
      return res.status(429).json({
        error: 'Денний ліміт вичерпано. Зачекайте оновлення або спробуйте пізніше.',
        messagesRemaining: 0,
        resetAt: quota.resetAt
      });
    }

    // Decrement remaining messages
    const newRemaining = quota.messagesRemaining - 1;
    await db.collection('users').updateOne(
      { id: DEFAULT_USER.id },
      { $set: { messagesRemaining: newRemaining, resetAt: quota.resetAt } }
    );
    
    // Save user message
    const userMsg = {
      chatId,
      userId: DEFAULT_USER.id,
      role: 'user',
      content: content.trim(),
      createdAt: new Date()
    };
    await db.collection('messages').insertOne(userMsg);

    // Fetch conversation context for AI (strict limit: last 8 messages)
    const history = await db.collection('messages')
      .find({ chatId })
      .sort({ createdAt: 1 })
      .toArray();

    const formattedHistory = history.slice(-8).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Update chat title if it's the first message
    if (history.length <= 1) {
      const summaryTitle = content.slice(0, 30);
      await db.collection('chats').updateOne(
        { _id: new ObjectId(chatId) },
        { $set: { title: summaryTitle, updatedAt: new Date() } }
      );
    } else {
      await db.collection('chats').updateOne(
        { _id: new ObjectId(chatId) },
        { $set: { updatedAt: new Date() } }
      );
    }

    // Set up SSE for streaming AI response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send quota update event first
    res.write(`data: ${JSON.stringify({ quota: { messagesRemaining: newRemaining, resetAt: quota.resetAt } })}\n\n`);

    let fullAiResponse = '';

    await streamChatCompletion({
      messages: formattedHistory,
      language,
      userMemories: user.memories || DEFAULT_USER.memories,
      onToken: (token) => {
        fullAiResponse += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      },
      onToolCall: async (name, args) => {
        console.log(`[Tool Invocation] ${name}:`, args);
        if ((name === 'save_memory' || name === 'remember_user_fact') && args.fact) {
          const scope = ['global', 'da', 'en'].includes(args.scope) ? args.scope : 'global';
          await db.collection('users').updateOne(
            { id: DEFAULT_USER.id },
            { $push: { [`memories.${scope}`]: args.fact.trim() } }
          );
          res.write(`data: ${JSON.stringify({ memoryLearned: { scope, fact: args.fact.trim() } })}\n\n`);
          return `Fact remembered in ${scope} memory: ${args.fact}`;
        } else if (name === 'save_word_to_vault' && args.phrase) {
          const wordEntry = {
            userId: DEFAULT_USER.id,
            language: args.language || language,
            phrase: args.phrase.trim(),
            translation: (args.translation || '').trim(),
            ipa: '',
            createdAt: new Date()
          };
          await db.collection('words').updateOne(
            { userId: DEFAULT_USER.id, language: wordEntry.language, phrase: wordEntry.phrase },
            { $set: wordEntry },
            { upsert: true }
          );
          res.write(`data: ${JSON.stringify({ wordSaved: wordEntry })}\n\n`);
          return `Saved word "${args.phrase}" to vault`;
        }
        return 'tool processed';
      },
      onDone: async () => {
        // AI finished, save to MongoDB
        if (fullAiResponse.trim()) {
          const aiMsg = {
            chatId,
            userId: DEFAULT_USER.id,
            role: 'assistant',
            content: fullAiResponse.trim(),
            createdAt: new Date()
          };
          await db.collection('messages').insertOne(aiMsg);
        }
        res.write(`data: [DONE]\n\n`);
        res.end();
      },
      onError: (err) => {
        console.error('[Stream Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    });

  } catch (e) {
    console.error('[Message Handler Error]', e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    }
  }
});

// 6. Edge-TTS Audio Generation
app.get('/api/tts', async (req, res) => {
  const { text, lang = 'da', speed = '0.80', voice } = req.query;
  if (!text) {
    return res.status(400).send('Missing text parameter');
  }

  try {
    const audioStream = await synthesizeEdgeSpeech(text, lang, parseFloat(speed), voice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    audioStream.on('error', (err) => {
      console.warn('[TTS Stream Handled]', err.message);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    res.on('close', () => {
      try {
        audioStream.destroy?.();
      } catch (e) {}
    });

    audioStream.pipe(res);
  } catch (e) {
    console.error('[TTS Error]', e.message);
    if (!res.headersSent) {
      res.status(500).send(`TTS Error: ${e.message}`);
    }
  }
});

// 7. Free Transcription & Translation
app.post('/api/transcribe', async (req, res) => {
  const { text, lang = 'da', userLang = 'uk' } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Missing text' });
  }

  try {
    const result = await resolveTranscriptionAndTranslation(text, lang, userLang);
    res.json(result);
  } catch (e) {
    console.error('[Transcribe Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 8. Word Vault
app.post('/api/words', async (req, res) => {
  const { phrase, translation, ipa, language = 'da' } = req.body;
  try {
    const db = await getDb();
    const wordEntry = {
      userId: DEFAULT_USER.id,
      language,
      phrase: phrase.trim(),
      translation: translation.trim(),
      ipa: ipa.trim(),
      createdAt: new Date()
    };
    await db.collection('words').updateOne(
      { userId: DEFAULT_USER.id, language, phrase: wordEntry.phrase },
      { $set: wordEntry },
      { upsert: true }
    );
    res.json({ success: true, word: wordEntry });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/words', async (req, res) => {
  const language = req.query.language || 'da';
  try {
    const db = await getDb();
    const words = await db.collection('words')
      .find({ userId: DEFAULT_USER.id, language })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(words);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/words', async (req, res) => {
  const { phrase, language = 'da' } = req.body;
  if (!phrase) return res.status(400).json({ error: 'Phrase is required' });
  try {
    const db = await getDb();
    await db.collection('words').deleteOne({ userId: DEFAULT_USER.id, language, phrase });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[FastLearn Backend] Listening on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[FastLearn Backend] Port ${PORT} already in use, retrying...`);
  } else {
    console.error('[FastLearn Backend Server error]', err);
  }
});
