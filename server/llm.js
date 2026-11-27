import {
  ALL_TOOL_DECLARATIONS,
  BASE_PROMPTS,
  buildPrimingAcknowledgement,
  buildSystemPrompt,
  getThinkingConfig,
  lockLatestUserMessage
} from './modelConfig.js';
import {
  SEARCH_TOOL_NAMES,
  createTurnSearchBudget,
  executeSearchBatch,
  parseSearchServers
} from './searchRouter.js';
import dotenv from 'dotenv';
dotenv.config();

export { BASE_PROMPTS, buildSystemPrompt };
export const AI_TOOLS = ALL_TOOL_DECLARATIONS;

export function getSearchConfigFromEnv(env = process.env) {
  return {
    servers: parseSearchServers(env.SEARXNG_URLS),
    apiKey: typeof env.SEARXNG_API_KEY === 'string' ? env.SEARXNG_API_KEY.trim() : ''
  };
}

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
// 2. STREAMING CHAT COMPLETION & ADAPTIVE TOOLS
// ==========================================
export async function streamChatCompletion({
  messages,
  language = 'da',
  userMemories = null,
  enableTools = false,
  onToken,
  onDone,
  onError,
  onToolCall,
  onSearch
}) {
  const toolsEnabled = Boolean(enableTools && onToolCall);
  const systemPrompt = buildSystemPrompt(language, userMemories, toolsEnabled);
  const searchConfig = getSearchConfigFromEnv();
  const turnBudget = createTurnSearchBudget();

  // Clamp history: last 12 messages for richer conversational continuity without token bloat
  const clampedHistory = messages.slice(-12);

  // Initial priming + latest message language lock (compatible with both Gemini & Gemma models)
  const latestMessageIndex = clampedHistory.length - 1;
  const contents = [
    {
      role: 'user',
      parts: [{ text: `[System Instruction: ${systemPrompt}]` }]
    },
    {
      role: 'model',
      parts: [{ text: buildPrimingAcknowledgement(language) }]
    },
    ...clampedHistory.map((m, index) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{
        text: m.role === 'user' && index === latestMessageIndex
          ? lockLatestUserMessage(m.content, language)
          : m.content
      }]
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
    const thinkingConfig = getThinkingConfig(model);

    for (let kIdx = 0; kIdx < requestKeys.length; kIdx++) {
      const key = requestKeys[kIdx];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        let activeContents = [...contents];
        let finalCleanText = '';

        for (let round = 0; round < 5; round++) {
          const allowToolsThisRound = toolsEnabled && round < 4;
          const payload = {
            contents: activeContents,
            ...(toolsEnabled ? { tools: [{ functionDeclarations: AI_TOOLS }] } : {}),
            ...(toolsEnabled
              ? { toolConfig: { functionCallingConfig: { mode: allowToolsThisRound ? 'AUTO' : 'NONE' } } }
              : {}),
            generationConfig: {
              maxOutputTokens: 1536,
              temperature: 0.72,
              ...(thinkingConfig ? { thinkingConfig } : {})
            }
          };

          const res = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            keyRotator.reportFailure(key, res.status);
            const errJson = await res.json().catch(() => ({}));
            throw new Error(`Gemini HTTP ${res.status}: ${errJson.error?.message || res.statusText}`);
          }

          keyRotator.reportSuccess(key);
          const data = await res.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          const functionCallParts = parts.filter((p) => p && typeof p === 'object' && p.functionCall);

          if (allowToolsThisRound && functionCallParts.length > 0) {
            const resultsByIndex = new Array(functionCallParts.length);
            const searchEntries = [];
            const memoryEntries = [];

            for (let i = 0; i < functionCallParts.length; i += 1) {
              const { name, args } = functionCallParts[i].functionCall;
              if (SEARCH_TOOL_NAMES.has(name)) {
                searchEntries.push({ index: i, call: { name, args } });
              } else {
                memoryEntries.push({ index: i, name, args });
              }
            }

            if (searchEntries.length > 0) {
              if (onSearch) onSearch({ tools: searchEntries.map((entry) => entry.call.name) });
              const batchResults = await executeSearchBatch(
                searchEntries.map((entry) => entry.call),
                turnBudget,
                {
                  servers: searchConfig.servers,
                  apiKey: searchConfig.apiKey,
                  signal: controller.signal
                }
              );
              for (let j = 0; j < searchEntries.length; j += 1) {
                resultsByIndex[searchEntries[j].index] = batchResults[j];
              }
            }

            for (const entry of memoryEntries) {
              try {
                resultsByIndex[entry.index] = await onToolCall(entry.name, entry.args);
              } catch (toolErr) {
                console.warn('[Tool Execution Error]', toolErr.message);
                resultsByIndex[entry.index] = {
                  error: toolErr instanceof Error ? toolErr.message : String(toolErr)
                };
              }
            }

            const responseParts = functionCallParts.map((part, i) => ({
              functionResponse: {
                name: part.functionCall.name,
                response: { result: resultsByIndex[i] ?? { ok: true } }
              }
            }));

            activeContents = [
              ...activeContents,
              { role: 'model', parts },
              { role: 'user', parts: responseParts }
            ];
            continue;
          }

          const textPart = parts.find((p) => p.text && !p.thought) || parts.find((p) => p.text);
          if (textPart && textPart.text && textPart.text.trim()) {
            finalCleanText = textPart.text.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
          }
          break;
        }

        clearTimeout(timeout);

        if (finalCleanText) {
          await streamWords(finalCleanText, onToken);
          success = true;
          if (onDone) onDone();
          break;
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
  const words = text.match(/\S+\s*/g) ?? [text];
  for (let i = 0; i < words.length; i += 2) {
    const chunk = words.slice(i, i + 2).join('');
    onToken(chunk);
    await new Promise((r) => setTimeout(r, 6));
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
