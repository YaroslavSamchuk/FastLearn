// language: TypeScript, file: worker/index.ts, target: Cloudflare Workers
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  GEMINI_API_KEYS?: string;
  DB_NAME?: string;
}

const FALLBACK_KEYS_B64 =
  'QVEuQWI4Uk42SWZQU0JZU1VvdlhBNGhuX3Z1RGp3aV95WFlGLUlVbUl1UC00dTNhWmdjWGcsQVEuQWI4Uk42S0x0TEVCVExXZ3pjY3dBeTRHaU5NSV9wNkVBRlBUa1I2ZkRhRGdmTmhUTGcsQVEuQWI4Uk42TFhmTmh5ZUtWczZua3ZPcXlEUjZzbGpyM2p6Q2IwYW90My1TNk1IbDlHNFEsQVEuQWI4Uk42SmNKREk0WU1jNS1wWGFZV2lhRG5zNFNPZ2dSS0xuNDVhX3R1Ui1hdWwxcVEsQVEuQWI4Uk42S1V0UUtlTDdCU294NXJwWXRsWlFzMjVTa1p1T1llVGZXMUZEOE1GYjg2aUE=';

let requestCounter = 0;

function getRotatedKeys(env: Env): string[] {
  let raw = (env.GEMINI_API_KEYS || '').trim();
  if (!raw && typeof atob === 'function') {
    try {
      raw = atob(FALLBACK_KEYS_B64);
    } catch {}
  }

  const keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (keys.length === 0) return [];

  const startIndex = requestCounter % keys.length;
  requestCounter = (requestCounter + 1) % 1000000;

  const result: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    result.push(keys[(startIndex + i) % keys.length]);
  }
  return result;
}

// In-memory store for edge worker lifecycle
const inMemoryStore = {
  words: new Map<string, any[]>(),
  messages: new Map<string, any[]>(),
  chats: new Map<string, any[]>()
};

// Simple IPA and translation utilities for Worker Edge
async function getGoogleTranslation(text: string, sourceLang: string, targetLang = 'uk'): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const json: any = await res.json();
      const translated = json[0]?.map((item: any) => item[0]).filter(Boolean).join(' ') || '';
      if (translated) return translated;
    }
  } catch (e) {}
  return text;
}

async function getEnglishIPA(word: string): Promise<string> {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return '';
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`);
    if (res.ok) {
      const data: any = await res.json();
      const phonetic = data[0]?.phonetic || data[0]?.phonetics?.find((p: any) => p.text)?.text;
      if (phonetic) return phonetic;
    }
  } catch (e) {}
  return '';
}

async function getDanishIPA(word: string): Promise<string> {
  const clean = word.toLowerCase().replace(/[^a-zæøå]/g, '');
  if (!clean) return '';
  try {
    const res = await fetch(
      `https://en.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&titles=${encodeURIComponent(clean)}&format=json`
    );
    if (res.ok) {
      const pages = data.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        const content = pages[pageId]?.revisions?.[0]?.['*'] || '';
        const m = content.match(/\{\{IPA\|da\|([^|}]+)/i) || content.match(/\[([a-zæøåɡðŋʁɕʑʔˈˌː\.\s]+)\]/i);
        if (m && m[1]) return `/${m[1].trim()}/`;
      }
    }
  } catch (e) {}
  return '';
}

const SYSTEM_PROMPTS: Record<string, string> = {
  da: `Du er en ægte dansk ven og samtalepartner på WhatsApp/Signal.
Varm, levende, humoristisk, nærværende og uformel.
Hold altid svaret KORT: 1–2 naturlige sætninger (maks 30 ord).
Hvis brugeren laver en sprogfejl, flet en venlig formulering ind først i parentes: *(Eller: "..." 😉)*, ellers svar direkte uden rettelse. Svar KUN med din besked.`,
  en: `You are a genuine, close friend and texting buddy on WhatsApp/iMessage.
Warm, relaxed, witty, and authentic.
Keep replies SHORT and casual: 1 to 2 sentences max (under 30 words).
If user makes a mistake, gently rephrase at the start: *(Or casually: "..." 😉)*, otherwise just reply directly. Output ONLY your message.`
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. API Route Handler
    if (url.pathname.startsWith('/api/')) {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Health
      if (url.pathname === '/api/health') {
        return new Response(
          JSON.stringify({
            status: 'online',
            edge: 'Cloudflare Worker',
            models: ['gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemma-4-26b-a4b-it']
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // User & Auth
      if (url.pathname === '/api/user' || url.pathname === '/api/auth/google') {
        const defaultUser = {
          id: 'usr_yaroslav_01',
          name: 'Yaroslav Samchuk',
          email: 'samchukyaroslav@gmail.com',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
          currentLanguage: 'da',
          voicePreferences: { da: 'da-DK-ChristelNeural', en: 'en-US-JennyNeural' },
          messagesRemaining: 30,
          dailyLimit: 30,
          resetAt: new Date(Date.now() + 15 * 3600 * 1000).toISOString(),
          memories: {
            global: ['Рідна мова — українська. Цінує стислість та живий тон.'],
            da: ['Вивчає розмовну данську мову (Dansk) для повсякденного життя.'],
            en: ['Вільне повсякденне та ділове спілкування англійською.']
          }
        };

        if (request.method === 'POST') {
          try {
            const body = await request.json();
            return new Response(JSON.stringify({ ...defaultUser, ...body }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } catch {
            return new Response(JSON.stringify(defaultUser), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        return new Response(JSON.stringify(defaultUser), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Chats List
      if (url.pathname === '/api/chats') {
        const lang = (url.searchParams.get('language') as 'da' | 'en') || 'da';
        const defaultChat = {
          _id: `chat_${lang}_default`,
          userId: 'usr_yaroslav_01',
          language: lang,
          title: lang === 'da' ? 'Ny samtale' : 'New dialogue',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (request.method === 'POST') {
          try {
            const body: any = await request.json();
            const newChat = {
              _id: `chat_${Date.now()}`,
              userId: 'usr_yaroslav_01',
              language: body.language || 'da',
              title: body.title || (lang === 'da' ? 'Ny samtale' : 'New dialogue'),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            return new Response(JSON.stringify(newChat), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } catch {
            return new Response(JSON.stringify(defaultChat), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        return new Response(JSON.stringify([defaultChat]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Delete Chat
      if (url.pathname.startsWith('/api/chats/') && request.method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Chat Messages List
      if (url.pathname.match(/\/api\/chats\/[^/]+\/messages$/) && request.method === 'GET') {
        const chatId = url.pathname.split('/')[3];
        const msgs = inMemoryStore.messages.get(chatId) || [];
        return new Response(JSON.stringify(msgs), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Post Chat Message & Stream Completion (Gemini SSE)
      if (url.pathname.match(/\/api\/chats\/[^/]+\/messages$/) && request.method === 'POST') {
        try {
          const body: any = await request.json();
          const userContent = (body.content || '').trim();
          const lang = body.language || 'da';
          const systemPrompt = SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.da;
          const chatId = url.pathname.split('/')[3] || 'default';

          // Maintain conversation history
          const chatHistory = inMemoryStore.messages.get(chatId) || [];
          chatHistory.push({ role: 'user', content: userContent });
          inMemoryStore.messages.set(chatId, chatHistory);

          const keys = getRotatedKeys(env);
          const models = [
            'gemini-flash-lite-latest',
            'gemini-3.5-flash',
            'gemini-3-flash-preview',
            'gemma-4-26b-a4b-it'
          ];

          // Create SSE streaming response
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();

          (async () => {
            let streamed = false;

            // Prepare contextual multi-turn conversation
            const conversationContents = [
              { role: 'user', parts: [{ text: `[System Instructions: ${systemPrompt}]` }] },
              {
                role: 'model',
                parts: [
                  { text: lang === 'da' ? 'Forstået, jeg skriver som en ven på dansk!' : 'Got it, let’s chat!' }
                ]
              },
              ...chatHistory.slice(-8).map((m: any) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
              }))
            ];

            for (const model of models) {
              if (streamed) break;

              for (const key of keys) {
                if (streamed) break;

                try {
                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
                  const payload = {
                    contents: conversationContents,
                    generationConfig: {
                      temperature: 0.72,
                      maxOutputTokens: 250
                    }
                  };

                  const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });

                  if (geminiRes.ok) {
                    const data: any = await geminiRes.json();
                    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    text = text.trim();

                    if (text) {
                      // Save to chat history
                      chatHistory.push({ role: 'assistant', content: text });
                      inMemoryStore.messages.set(chatId, chatHistory);

                      // Stream tokens word by word with micro-delay for kinetic feel
                      const words = text.split(' ');
                      for (let i = 0; i < words.length; i++) {
                        const token = words[i] + (i < words.length - 1 ? ' ' : '');
                        await writer.write(
                          encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
                        );
                      }
                      await writer.write(encoder.encode(`data: [DONE]\n\n`));
                      streamed = true;
                      break;
                    }
                  }
                } catch (err) {}
              }
            }

            // Fallback response if all API keys rate limited
            if (!streamed) {
              const fallback =
                lang === 'da'
                  ? 'Hej ven! Hvad vil du gerne snakke om i dag?'
                  : 'Hey there! What would you like to talk about today?';
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ token: fallback })}\n\n`)
              );
              await writer.write(encoder.encode(`data: [DONE]\n\n`));
            }

            await writer.close();
          })();

          return new Response(readable, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive'
            }
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Transcribe & Phonetics (Word Lens)
      if (url.pathname === '/api/transcribe' && request.method === 'POST') {
        try {
          const body: any = await request.json();
          const text = (body.text || '').trim();
          const lang = body.lang || 'da';
          const userLang = body.userLang || 'uk';

          const [translation, ipa] = await Promise.all([
            getGoogleTranslation(text, lang, userLang),
            lang === 'da' ? getDanishIPA(text) : getEnglishIPA(text)
          ]);

          return new Response(
            JSON.stringify({
              original: text,
              translation: translation || text,
              ipa: ipa || (lang === 'da' ? `[da: ${text}]` : `/${text}/`)
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Word Vault Endpoints
      if (url.pathname === '/api/words') {
        const lang = url.searchParams.get('language') || 'da';
        const list = inMemoryStore.words.get(lang) || [];

        if (request.method === 'GET') {
          return new Response(JSON.stringify(list), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (request.method === 'POST') {
          try {
            const body: any = await request.json();
            const current = inMemoryStore.words.get(body.language || lang) || [];
            const updated = [body, ...current.filter((w: any) => w.phrase !== body.phrase)];
            inMemoryStore.words.set(body.language || lang, updated);
            return new Response(JSON.stringify({ success: true, word: body }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } catch {
            return new Response(JSON.stringify({ success: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        if (request.method === 'DELETE') {
          try {
            const body: any = await request.json();
            const current = inMemoryStore.words.get(body.language || lang) || [];
            inMemoryStore.words.set(
              body.language || lang,
              current.filter((w: any) => w.phrase !== body.phrase)
            );
            return new Response(JSON.stringify({ success: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } catch {
            return new Response(JSON.stringify({ success: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
      }

      // Fallback 404 for unknown API
      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Static Assets Handler (Single-Page Application)
    return env.ASSETS.fetch(request);
  }
};
