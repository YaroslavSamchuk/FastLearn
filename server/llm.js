import dotenv from 'dotenv';
dotenv.config();

const API_KEYS = (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
let currentKeyIndex = 0;

function getNextKey() {
  if (API_KEYS.length === 0) return '';
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

export const PROMPTS = {
  da: `Du er en ægte dansk ven, der skriver på Messenger eller WhatsApp.
Dine svar skal lyde 100% som en rigtig dansker i 20-30'erne:
- Hold det altid KORT: 1-3 naturlige sætninger (maks 25-35 ord).
- Brug naturligt hverdagssprog, slang og fyldord (fx "Hvad så?", "Det lyder mega fedt", "Ej hvor vildt", "Helt sikkert").
- Stil højst ÉT simpelt modspørgsmål eller reager bare som en ven.
- Du må ALDRIG lyde som en sproglærer, og ALDRIG bruge punkttegn.
- Skriv udelukkende på dansk.`,

  en: `You are a real native friend texting casually on WhatsApp or iMessage.
Your replies MUST feel 100% human and informal:
- Keep it SHORT: 1 to 3 casual sentences maximum (under 35 words).
- Use natural contractions, slang, and modern conversational flow ("no way", "that's wild", "what are you up to?", "honestly same").
- Ask at most ONE natural follow-up or just react directly to what was texted.
- NEVER lecture, NEVER act like an AI teacher, and NEVER output bullet points.
- Write entirely in English.`
};

export async function streamChatCompletion(messages, language = 'da', onToken, onDone, onError) {
  const systemPrompt = PROMPTS[language] || PROMPTS.en;
  
  // Strict context clamp: Maximum last 8 messages to save input tokens
  const clampedHistory = messages.slice(-8);

  // Convert to Gemini contents format
  const contents = [
    {
      role: 'user',
      parts: [{ text: `[System Instruction: ${systemPrompt}]` }]
    },
    {
      role: 'model',
      parts: [{ text: language === 'da' ? 'Forstået, jeg skriver som en ven på dansk.' : 'Got it, texting naturally like a friend.' }]
    },
    ...clampedHistory.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
  ];

  // Primary: gemma-4-31b-it as requested by RIOT
  // Fallbacks: gemma-4-26b-a4b-it & gemini-3.1-flash-lite
  const candidateModels = [
    'gemma-4-31b-it',
    'gemma-4-26b-a4b-it',
    'gemini-3.1-flash-lite'
  ];

  let success = false;
  let lastError = null;

  for (const model of candidateModels) {
    const key = getNextKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            // Strict token clamp: Max 600 tokens (well within 800-1000 limit)
            maxOutputTokens: 600,
            temperature: 0.72
          }
        })
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(`Gemini HTTP ${res.status}: ${errJson.error?.message || res.statusText}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (rawText && rawText.trim()) {
        const text = rawText.trim();
        // Stream out in word-chunks with small timing to simulate natural typing
        const words = text.split(' ');
        for (let i = 0; i < words.length; i++) {
          const wordToken = (i === 0 ? '' : ' ') + words[i];
          onToken(wordToken);
          // 15ms micro-delay for smooth text render
          await new Promise(r => setTimeout(r, 15));
        }

        success = true;
        onDone();
        break;
      }
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`[Gemini API] Model ${model} failed (${err.name}):`, err.message);
      lastError = err;
    }
  }

  if (!success) {
    if (onError) onError(lastError || new Error('All Gemini models failed'));
  }
}
