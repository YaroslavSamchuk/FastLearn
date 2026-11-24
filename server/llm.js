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
  da: `Du er en hjælpsom og naturlig partner til at øve dansk. Vær venlig og samtalende, men prioritér et korrekt, nyttigt svar frem for at være kort for enhver pris.

=== FAST SVARFORMAT ===
Læs den seneste brugermeddelelse grundigt. Ret kun dansk, som brugeren selv forsøger at skrive; ret ikke ukrainsk eller andre sprog.
- Hvis brugerens danske sætning har en reel grammatikfejl eller er unaturlig, skriv først en korrigeret version med den præcise label "Виправлено:". Bevar brugerens oprindelige betydning.
- Hvis en separat formulering lyder tydeligt mere naturlig i daglig tale, tilføj efter én tom linje "Розмовніше:" efterfulgt af den naturlige version. Udelad dette, hvis det ikke giver en reel forbedring.
- Skriv derefter én tom linje og besvar brugerens besked direkte. Selve svaret skal normalt være 1–6 hele sætninger: enkelt spørgsmål = kort svar; spørgsmål, der kræver forklaring eller præcision = nok detaljer til at være korrekt og brugbar.
- Når sætningen allerede er korrekt og naturlig, må du ikke tilføje en rettelse. Giv kun svaret, eller en "Розмовніше:"-version og derefter svaret, hvis den tydeligt forbedrer formuleringen.
- Adskil kun de dele, der findes, med én tom linje. Brug ikke yderligere overskrifter, punktopstillinger eller kodeblokke, medmindre brugeren specifikt beder om dem.

=== KORREKTHED ===
- Svar normalt på dansk; følg et eksplicit ønske om et andet sprog.
- Besvar det konkrete spørgsmål, og vær specifik. Opfind ikke fakta, personlige detaljer, danske ord eller grammatikregler. Hvis du er usikker, sig kort hvad der er usikkert i stedet for at gætte.
- Brug hukommelsen og samtalen som kilde til personlige oplysninger. Vær varm og uformel uden tomme komplimenter, foredrag eller unødvendige opfølgende spørgsmål.`,

  en: `You are a helpful, natural partner for practicing English. Be warm and conversational, but prioritize a correct, useful answer over being brief for its own sake.

=== REQUIRED RESPONSE FORMAT ===
Carefully check the latest user message. Correct only English the user is attempting to write; do not correct Ukrainian or other languages.
- If the user's English has a genuine grammar error or sounds unnatural, begin with a corrected version using the exact label "Виправлено:". Preserve the user's intended meaning.
- If a distinct version would sound noticeably more natural in everyday spoken English, add it after one blank line using "Розмовніше:". Omit it when it would not meaningfully improve the sentence.
- Then add one blank line and answer the user's message directly. The answer itself should usually be 1–6 complete sentences: a simple question gets a concise answer; a question requiring explanation or precision gets enough detail to be accurate and useful.
- If the sentence is already correct and natural, do not add a correction. Give only the answer, or a "Розмовніше:" version followed by the answer if it clearly improves the wording.
- Separate only the applicable parts with one blank line. Do not add any other headings, bullet lists, or code blocks unless the user explicitly asks for them.

=== ACCURACY ===
- Normally answer in English; follow an explicit request for another language.
- Answer the actual question specifically. Do not invent facts, personal details, English words, or grammar rules. If uncertain, briefly say what is uncertain instead of guessing.
- Use memory and conversation for personal details. Stay friendly and relaxed without filler praise, lectures, or unnecessary follow-up questions.`,
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
export function buildSystemPrompt(language = 'da', userMemories = null, enableTools = false) {
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
    memorySection += '(Brug oplysningerne diskret, og lad dem aldrig tilsidesætte kravene til svarformat, korrekthed eller tilstrækkelig forklaring.)';

    prompt += memorySection;
  }

  if (enableTools) {
    prompt +=
      '\n\nHvis brugeren fortæller et nyt, reelt faktum, kan du gemme det med værktøjet save_memory. Opfind aldrig fakta.';
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
  enableTools = false,
  onToken,
  onDone,
  onError,
  onToolCall
}) {
  const systemPrompt = buildSystemPrompt(language, userMemories, enableTools && Boolean(onToolCall));

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

  // Ordered model candidates. Override with GEMINI_MODELS (comma separated) when needed.
  const candidateModels = (process.env.GEMINI_MODELS ||
    'gemini-flash-lite-latest,gemini-3-flash-preview,gemma-4-26b-a4b-it,gemma-4-31b-it')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  // Get ordered keys starting with the NEXT key in line for this new request
  const requestKeys = keyRotator.getKeysForRequest();

  let success = false;
  let lastError = null;

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const model = candidateModels[mIdx];
    const isPrimary = (mIdx === 0);

    if (!isPrimary) {
      console.warn(`[Gemini Failover] Trying backup model: ${model}`);
    }

    for (let kIdx = 0; kIdx < requestKeys.length; kIdx++) {
      const key = requestKeys[kIdx];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 22000);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        
        const payload = {
          contents,
          ...(enableTools && onToolCall ? { tools: [{ functionDeclarations: AI_TOOLS }] } : {}),
          generationConfig: {
            maxOutputTokens: 512,
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
          throw new Error(`Gemini HTTP ${res.status}: ${errJson.error?.message || res.statusText}`);
        }

        keyRotator.reportSuccess(key);
        const data = await res.json();
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        // Check if model emitted a function call
        const functionCallPart = parts.find(p => p.functionCall);
        if (enableTools && onToolCall && functionCallPart) {
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
        console.warn(`[Gemini API] Model ${model} (Key #${kIdx + 1}/${requestKeys.length}) failed:`, err.message);
        // Brief settling delay before trying the next key
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // If primary model succeeded on any key, break out! Backup model is NEVER called.
    if (success) break;
  }

  if (!success) {
    if (onError) onError(lastError || new Error('All Gemini models/keys are currently limited. Please retry in a few moments.'));
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

// Generate concise, contextual chat title using Gemini
export async function generateChatTitle({ message, language = 'da' }) {
  const cleanMsg = typeof message === 'string' ? message.trim().slice(0, 300) : '';
  if (!cleanMsg) return language === 'da' ? 'Ny samtale' : 'New conversation';

  const prompt = language === 'da'
    ? `Giv en meget kort og præcis overskrift (2-5 ord, maks 35 tegn) til en samtale, der starter med: "${cleanMsg}". Svar KUN med selve overskriften uden citationstegn, punktum eller forklaringer.`
    : `Generate a very short, concise title (2-5 words, max 35 characters) for a conversation that starts with: "${cleanMsg}". Respond ONLY with the title itself, without quotes, periods, or explanations.`;

  const candidateModels = (process.env.GEMINI_MODELS ||
    'gemini-flash-lite-latest,gemini-3-flash-preview,gemma-4-26b-a4b-it,gemma-4-31b-it')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  const requestKeys = keyRotator.getKeysForRequest();

  for (const model of candidateModels) {
    for (const key of requestKeys) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 30, temperature: 0.3 }
          })
        });
        clearTimeout(timeout);
        if (!res.ok) continue;
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText && typeof rawText === 'string') {
          const title = rawText
            .replace(/["'\n\r#*_]/g, '')
            .trim()
            .slice(0, 45);
          if (title) return title;
        }
      } catch {
        // try next key/model
      }
    }
  }

  const fallback = cleanMsg.slice(0, 35).trim();
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}
