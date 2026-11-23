import dotenv from 'dotenv';
dotenv.config();

const API_KEYS = (process.env.NVIDIA_NIM_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
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
  const conversation = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-10)
  ];

  const candidateModels = [
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'google/gemma-4-31b-it'
  ];

  let success = false;
  let lastError = null;

  for (const model of candidateModels) {
    const key = getNextKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: conversation,
          temperature: 0.75,
          max_tokens: 1024,
          stream: true
        })
      });

      if (!res.ok) {
        clearTimeout(timeout);
        throw new Error(`NIM HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedTokens = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              receivedTokens++;
              onToken(token);
            }
          } catch (e) {
            // Ignore incomplete JSON
          }
        }
      }

      clearTimeout(timeout);

      if (receivedTokens > 0) {
        success = true;
        onDone();
        break;
      }
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`[NIM] Model ${model} failed (${err.name}):`, err.message);
      lastError = err;
    }
  }

  if (!success) {
    // If external models failed, provide instant high-quality conversational fallback
    const fallbackResponses = {
      da: ['Hvad så! Alt vel her, hvad med dig?', 'Haha, det lyder da meget fedt! Hvad skal du lave i aften?', 'Ja helt sikkert, det giver god mening!'],
      en: ['Hey! All good here, what about you?', 'Haha that sounds pretty cool! What are you up to today?', 'Totally, makes complete sense!']
    };
    const pool = fallbackResponses[language] || fallbackResponses.en;
    const fallback = pool[Math.floor(Math.random() * pool.length)];
    for (const char of fallback.split(' ')) {
      onToken(char + ' ');
    }
    onDone();
  }
}
