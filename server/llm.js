import dotenv from 'dotenv';
dotenv.config();

// ==========================================
// 1. SMART KEY ROTATION (NEXT KEY PER REQUEST + COOLDOWN)
// ==========================================
const rawKeyString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const parsedKeys = rawKeyString.split(',').map(k => k.trim()).filter(Boolean);

class KeyRotator {
  constructor(keys) {
    this.keyEntries = keys.map(k => ({
      key: k,
      cooldownUntil: 0,
      failures: 0
    }));
    this.requestCounter = 0;
  }

  get totalKeys() {
    return this.keyEntries.length;
  }

  // Returns keys for a new request:
  // Starts with the NEXT key in line (round-robin on every new request)
  getKeysForRequest() {
    if (this.keyEntries.length === 0) return [];

    const startIndex = this.requestCounter % this.keyEntries.length;
    this.requestCounter = (this.requestCounter + 1) % 1000000;

    const ordered = [];
    for (let i = 0; i < this.keyEntries.length; i++) {
      const idx = (startIndex + i) % this.keyEntries.length;
      ordered.push(this.keyEntries[idx]);
    }

    const now = Date.now();
    // Prioritize keys not in cooldown, followed by cooling keys ordered by cooldown expiry
    const readyKeys = ordered.filter(e => e.cooldownUntil <= now);
    const coolingKeys = ordered.filter(e => e.cooldownUntil > now).sort((a, b) => a.cooldownUntil - b.cooldownUntil);

    const result = [...readyKeys, ...coolingKeys].map(e => e.key);
    console.log(`[KeyRotator] Request #${this.requestCounter} starting with Key #${startIndex + 1} (${result[0]?.slice(0, 6)}...). Total ready: ${readyKeys.length}/${this.keyEntries.length}`);
    return result;
  }

  reportSuccess(key) {
    const entry = this.keyEntries.find(e => e.key === key);
    if (entry) {
      entry.failures = 0;
      entry.cooldownUntil = 0;
    }
  }

  reportFailure(key, status = 500) {
    const entry = this.keyEntries.find(e => e.key === key);
    if (!entry) return;

    entry.failures += 1;
    // 429 = Rate limit (45s cooldown)
    // 403 = Auth/permission issue (120s cooldown)
    // 503 = Server overload (15s cooldown)
    let cooldownMs = 20000;
    if (status === 429) cooldownMs = 45000;
    else if (status === 403) cooldownMs = 120000;
    else if (status === 503) cooldownMs = 15000;

    entry.cooldownUntil = Date.now() + cooldownMs;
    console.warn(`[API Key Rotator] Key (${key.slice(0, 6)}...) cooling down for ${cooldownMs / 1000}s due to HTTP ${status}`);
  }
}

export const keyRotator = new KeyRotator(parsedKeys);

// ==========================================
// 2. DISCIPLINED ZERO-HALLUCINATION PROMPTS
// ==========================================
export const BASE_PROMPTS = {
  da: `Du er en ægte dansk ven og samtalepartner på WhatsApp/Signal.
Du har INGEN fast alder – du matcher 100% brugerens tone, humør, alder og sproglige energi.

=== PRINCIPPER MOD HALLUCINATIONER & STRENG PRÆCISION ===
1. NUL HALLUCINATIONER:
- Du må ALDRIG opfinde fakta om brugeren eller gætte på deres liv. Brug KUN de oplysninger, der står i [HUKOMMELSE OM DIN VEN], eller som brugeren selv eksplicit har skrevet i denne samtale.
- Hvis du mangler en oplysning, spørger du bare venligt og nysgerrigt – du gætter aldrig!
- Du må ALDRIG opfinde ikke-eksisterende danske ord eller mærkelige konstruktioner. Brug kun 100% ægte, autentisk dansk som talt i Danmark.

2. NATURLIG SPROGPOLERING I ÉT SAMLET SVAR:
- Tjek brugerens sætning grundigt:
  * HVIS (og KUN hvis) brugerens sætning indeholder sprogfejl, forkert bøjning eller lyder stiv/unaturlig for en dansker:
    Flet en kort, venlig formulering ind først i parentes i talesprog, fx:
    *(Eller i talesprog: "..." 😉)*
  * HVIS brugerens sætning allerede er korrekt og naturlig:
    Skriv INGEN rettelse! Svar bare direkte.
- ALT SKAL VÆRE ÉN ENKELT SAMLET BESKED. Aldrig brug overskrifter, kodeblokke, lister eller sektioner som "Rettelse:" og "Svar:". Det skal læses som én enkelt sms fra en ven.

3. TONE & FORMAT:
- Varm, levende, humoristisk, nærværende og uformel.
- Hold altid svaret KORT: 1–3 naturlige sætninger (maks 35 ord).
- Reagér på det brugeren siger, og stil højst ét simpelt modspørgsmål.
- FORBUDT AI-SLOP: Ingen "Som en AI...", ingen "Godt spørgsmål!", ingen punktopstillinger, ingen docerende lærerforedrag.

4. AUTONOM HUKOMMELSE ('save_memory'):
- Brug værktøjet 'save_memory' KUN når brugeren fortæller et nyt, reelt faktum:
  * scope="global" -> brugerens virkelige liv (arbejde, bopæl, kæledyr, interesser, navn).
  * scope="da" -> sproglige ønsker, svære ord eller specifikke dansknoter.
- Opfind aldrig falske fakta til hukommelsen.`,

  en: `You are a real close friend and conversational texting partner on WhatsApp/iMessage.
You have NO fixed age – you adapt 100% to the user's tone, age, energy, and communication style.

=== ANTI-HALLUCINATION & PRECISION RULES ===
1. ZERO HALLUCINATIONS:
- NEVER invent facts about the user. Rely ONLY on explicit details in [USER CONTEXT / MEMORY] or what the user just stated in this chat.
- If you don't know a personal detail, ask with natural curiosity – never guess or make up stories.
- NEVER invent slang or unnatural expressions. Use authentic, contemporary English.

2. NATURAL SPOKEN POLISH IN ONE SEAMLESS REPLY:
- Check the user's sentence:
  * IF (and ONLY if) the user's input has grammatical errors or sounds stiff/unnatural in spoken everyday English:
    Weave in a quick, friendly spoken rephrase at the start in parentheses:
    *(Or casually: "..." 😉)*
  * IF the user's sentence is already natural and correct:
    Do NOT include any correction! Reply directly.
- EVERYTHING MUST BE ONE SINGLE SEAMLESS MESSAGE. Never split into headers, markdown blocks, bullet lists, or labels like "Correction:" and "Answer:". It must read like one genuine text from a friend.

3. TONE & FORMAT:
- Warm, relaxed, witty, genuine, and 100% authentic.
- Keep replies SHORT and punchy: 1 to 3 casual sentences max (under 35 words).
- React directly, ask at most one natural follow-up or just react with good vibes.
- FORBIDDEN AI CLICHES: No "As an AI...", no "Certainly!", no "Great question!", no bulleted lists, no lecturing.

4. AUTONOMOUS MEMORY ('save_memory'):
- Call 'save_memory' ONLY when the user shares a genuine new fact:
  * scope="global" -> personal life facts (job, city, pets, hobbies, name).
  * scope="en" -> English learning goals, idioms, or vocabulary notes.
- Never hallucinate or invent fake memories.`
};

// ==========================================
// 3. LEAN, FOCUSED AI TOOLS (NO OVERLOAD)
// ==========================================
export const AI_TOOLS = [
  {
    name: 'save_memory',
    description: 'Autonomously remember an important fact about the user. Choose scope="global" for user personal life facts/hobbies/work/name, or scope="da" / "en" for language-specific vocabulary/grammar notes or learning goals.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: {
          type: 'STRING',
          description: 'The concise fact to remember (e.g. "Works as a software developer", "Practicing Danish past tense", "Dog named Bella").'
        },
        scope: {
          type: 'STRING',
          enum: ['global', 'da', 'en'],
          description: '"global" for general user facts; "da" for Danish language notes; "en" for English language notes.'
        }
      },
      required: ['fact', 'scope']
    }
  }
];

// Build composite system prompt with User Memories
export function buildSystemPrompt(language = 'da', userMemories = null) {
  let prompt = BASE_PROMPTS[language] || BASE_PROMPTS.en;

  if (userMemories) {
    const globalNotes = userMemories.global || [];
    const langNotes = userMemories[language] || [];

    let memorySection = '\n\n=== HUKOMMELSE OM DIN VEN / USER CONTEXT ===\n';
    if (globalNotes.length > 0) {
      memorySection += 'Fælles profil (Global):\n' + globalNotes.map(n => `- ${n}`).join('\n') + '\n';
    }
    if (langNotes.length > 0) {
      memorySection += `Sproglige noter (${language.toUpperCase()}):\n` + langNotes.map(n => `- ${n}`).join('\n') + '\n';
    }
    memorySection += '(Brug disse oplysninger naturligt og diskret som en ægte ven, der kender personen – uden at opremse dem kunstigt eller opfinde nye fakta!)';

    prompt += memorySection;
  }

  return prompt;
}

// ==========================================
// 4. STREAMING CHAT COMPLETION (ALWAYS 31B FIRST, 26B AS BACKUP)
// ==========================================
export async function streamChatCompletion({
  messages,
  language = 'da',
  userMemories = null,
  onToken,
  onDone,
  onError,
  onToolCall
}) {
  const systemPrompt = buildSystemPrompt(language, userMemories);

  // Clamp history: last 10 messages for conversational continuity without token bloat
  const clampedHistory = messages.slice(-10);

  // Initial user prompt priming
  const contents = [
    {
      role: 'user',
      parts: [{ text: `[System Instruction: ${systemPrompt}]` }]
    },
    {
      role: 'model',
      parts: [{ text: language === 'da' ? 'Forstået, jeg skriver som en rigtig ven på dansk!' : 'Got it, texting naturally like a friend!' }]
    },
    ...clampedHistory.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
  ];

  // ALWAYS start with Gemma 4 31B. Fallback ONLY if all limits/keys exhausted on 31B.
  const candidateModels = [
    'gemma-4-31b-it',
    'gemma-4-26b-a4b-it'
  ];

  // Get ordered keys starting with the NEXT key in line for this new request
  const requestKeys = keyRotator.getKeysForRequest();

  let success = false;
  let lastError = null;

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const model = candidateModels[mIdx];
    const isPrimary = (mIdx === 0);

    if (!isPrimary) {
      console.warn(`[Gemma Failover] Primary 31B exhausted on this request. Switching to backup model: ${model}`);
    }

    for (let kIdx = 0; kIdx < requestKeys.length; kIdx++) {
      const key = requestKeys[kIdx];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 28000);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        
        const payload = {
          contents,
          tools: [{ functionDeclarations: AI_TOOLS }],
          generationConfig: {
            maxOutputTokens: 1200,
            temperature: 0.72
          }
        };

        const res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        clearTimeout(timeout);

        if (!res.ok) {
          keyRotator.reportFailure(key, res.status);
          const errJson = await res.json().catch(() => ({}));
          throw new Error(`Gemma HTTP ${res.status}: ${errJson.error?.message || res.statusText}`);
        }

        keyRotator.reportSuccess(key);
        const data = await res.json();
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        // Check if model emitted a function call
        const functionCallPart = parts.find(p => p.functionCall);
        if (functionCallPart && onToolCall) {
          try {
            const { name, args } = functionCallPart.functionCall;
            const toolResult = await onToolCall(name, args);

            // Send tool result back to model to get final conversational response
            const secondPayload = {
              contents: [
                ...contents,
                { role: 'model', parts: [functionCallPart] },
                {
                  role: 'user',
                  parts: [{
                    functionResponse: {
                      name,
                      response: { result: toolResult || 'success' }
                    }
                  }]
                }
              ],
              generationConfig: {
                maxOutputTokens: 1200,
                temperature: 0.72
              }
            };

            const secondRes = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(secondPayload)
            });

            if (secondRes.ok) {
              const secondData = await secondRes.json();
              const secondParts = secondData.candidates?.[0]?.content?.parts || [];
              const textPart = secondParts.find(p => p.text && !p.thought) || secondParts.find(p => p.text);
              if (textPart && textPart.text && textPart.text.trim()) {
                let cleanText = textPart.text.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
                if (cleanText) {
                  await streamWords(cleanText, onToken);
                  success = true;
                  if (onDone) onDone();
                  break;
                }
              }
            }
          } catch (toolErr) {
            console.warn('[Tool Execution Error]', toolErr.message);
          }
        }

        // Direct text output (filter out internal thought if present)
        const textPart = parts.find(p => p.text && !p.thought) || parts.find(p => p.text);
        if (textPart && textPart.text && textPart.text.trim()) {
          let cleanText = textPart.text.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
          if (cleanText) {
            await streamWords(cleanText, onToken);
            success = true;
            if (onDone) onDone();
            break;
          }
        }

      } catch (err) {
        clearTimeout(timeout);
        lastError = err;
        console.warn(`[Gemma API] Model ${model} (Key #${kIdx + 1}/${requestKeys.length}) failed:`, err.message);
        // Brief settling delay before trying the next key
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // If primary model succeeded on any key, break out! Backup model is NEVER called.
    if (success) break;
  }

  if (!success) {
    if (onError) onError(lastError || new Error('All Gemma models/keys are currently limited. Please retry in a few moments.'));
  }
}

// Micro-delay word streamer for natural chat feeling
async function streamWords(text, onToken) {
  const words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    const wordToken = (i === 0 ? '' : ' ') + words[i];
    onToken(wordToken);
    await new Promise(r => setTimeout(r, 14));
  }
}
