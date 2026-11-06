import type { ChatMessage, CorrectionData, TranslationResult } from '../types';
import { cleanDanishWord, lookupLocalWord } from './dictionary';

export const AVAILABLE_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Рекомендована: блискавична і точна' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', desc: 'Надлегка та економна' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', desc: 'Стабільна перевірена версія' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Максимальна якість аналізу' },
];

export const DEFAULT_MODEL = 'gemini-2.5-flash';

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

const cleanJsonString = (raw: string): string => {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};

export class GeminiService {
  /**
   * Quick verification test for the entered API key.
   */
  static async testApiKey(apiKey: string, model: string = DEFAULT_MODEL): Promise<{ success: boolean; message: string }> {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, message: 'Ключ API не може бути порожнім.' };
    }

    try {
      const url = `${GEMINI_API_ENDPOINT}/${model}:generateContent?key=${apiKey.trim()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Ping. Svar kun "OK".' }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const errMsg = errorData?.error?.message || `Помилка сервера HTTP ${res.status}`;
        return { success: false, message: errMsg };
      }

      return { success: true, message: 'Ключ успішно підключено та перевірено!' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Помилка мережі при зʼєднанні з Google API.' };
    }
  }

  /**
   * Main conversational language tutor endpoint.
   */
  static async sendChatMessage({
    apiKey,
    model = DEFAULT_MODEL,
    userMessage,
    history = [],
    level = 'A1',
    userNotes = '',
  }: {
    apiKey: string;
    model?: string;
    userMessage: string;
    history?: ChatMessage[];
    level?: string;
    userNotes?: string;
  }): Promise<{
    danish_reply: string;
    correction?: CorrectionData | null;
  }> {
    if (!apiKey?.trim()) {
      throw new Error('API ключ Gemini не вказано. Перейдіть до налаштувань та збережіть ключ.');
    }

    const systemPrompt = `Ти — доброзичливий, лаконічний і уважний співрозмовник-носій датської мови (Danish language tutor).

ПРАВИЛА ДІАЛОГУ:
1. РОЗМОВЛЯЙ ЯК СПРАВЖНЯ ЛЮДИНА — КОРОТКО (1-3 речення датською). Ніяких довгих нудних лекцій чи лекцій-есе. Підтримуй живий, природний діалог (hyggelig samtale).
2. РІВЕНЬ УЧНЯ: ${level}. Підлаштовуй лексику та конструкції під цей рівень.
${userNotes ? `ПОСТІЙНІ ПОБАЖАННЯ УЧНЯ:\n${userNotes}` : ''}

3. АНАЛІЗ ПОВІДОМЛЕННЯ УЧНЯ:
   - Якщо учень написав датською з граматичними помилками, неправильним порядком слів або калькою з української/англійської:
     - "has_correction": true
     - "what_you_meant_uk": "Що учень напевно мав на увазі українською"
     - "natural_danish": "Як це природно сказати датською"
     - "explanation_uk": "Коротке зрозуміле пояснення правила українською"
   - Якщо репліка написана правильно або написана українською/англійською (наприклад, питання про мову):
     - "has_correction": false
     - "what_you_meant_uk": ""
     - "natural_danish": ""
     - "explanation_uk": ""

4. ПРОДОВЖЕННЯ РОЗМОВИ:
   - "danish_reply": Дай коротку природну людську відповідь датською (1-3 речення), яка органічно продовжує бесіду або ставить дружнє зустрічне запитання.

ФОРМАТ ВІДПОВІДІ — ВИКЛЮЧНО ВАЛІДНИЙ JSON БЕЗ ЗАЙВОГО ТЕКСТУ:
{
  "danish_reply": "Репліка датською",
  "has_correction": false,
  "what_you_meant_uk": "",
  "natural_danish": "",
  "explanation_uk": ""
}`;

    // Format previous turns for context
    const recentHistory = history.slice(-16);
    const conversationContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // System instruction passed via first turn or system_instruction if supported
    // For standard v1beta REST payload compatibility, prepend to context
    for (const msg of recentHistory) {
      conversationContents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    }

    // Add current user message with tutor instruction wrapping
    conversationContents.push({
      role: 'user',
      parts: [
        {
          text: `[КОНТЕКСТ СИСТЕМИ ДЛЯ ЦЬОГО КРОКУ]:\n${systemPrompt}\n\n[ПОВІДОМЛЕННЯ УЧНЯ]:\n${userMessage}`,
        },
      ],
    });

    const url = `${GEMINI_API_ENDPOINT}/${model}:generateContent?key=${apiKey.trim()}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: conversationContents,
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const detail = errBody?.error?.message || `HTTP ${res.status}`;
      throw new Error(`Помилка Gemini: ${detail}`);
    }

    const data: GeminiResponse = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('Отримано порожню відповідь від Gemini');
    }

    try {
      const parsed = JSON.parse(cleanJsonString(rawText));
      return {
        danish_reply: parsed.danish_reply || 'Hej! Godt at se dig.',
        correction: parsed.has_correction
          ? {
              has_correction: true,
              what_you_meant_uk: parsed.what_you_meant_uk || '',
              natural_danish: parsed.natural_danish || '',
              explanation_uk: parsed.explanation_uk || '',
            }
          : null,
      };
    } catch {
      // Fallback if model output wasn't valid JSON despite prompt
      return {
        danish_reply: rawText.replace(/```json|```/g, '').trim(),
        correction: null,
      };
    }
  }

  /**
   * Fast translation & detailed analysis of a single word.
   */
  static async translateWord({
    apiKey,
    model = DEFAULT_MODEL,
    word,
    contextSentence,
  }: {
    apiKey: string;
    model?: string;
    word: string;
    contextSentence?: string;
  }): Promise<TranslationResult> {
    const clean = cleanDanishWord(word);

    // 1. Check instant local dictionary first
    const local = lookupLocalWord(clean);
    if (!apiKey?.trim() && local) {
      return {
        word,
        word_clean: clean,
        translation_uk: local.translation,
        synonyms: local.synonyms || [],
        part_of_speech: local.pos,
        explanation_uk: local.explanation,
      };
    }

    if (!apiKey?.trim()) {
      return {
        word,
        word_clean: clean,
        translation_uk: local ? local.translation : '(Вкажіть API ключ у налаштуваннях)',
        synonyms: local?.synonyms || [],
        part_of_speech: local?.pos,
      };
    }

    const prompt = `Ти — датсько-український словник та лінгвіст.
Проаналізуй датське слово: "${clean}" (у реченні: "${contextSentence || ''}").

Поверни ТІЛЬКИ валідний JSON у форматі:
{
  "translation_uk": "найкращий переклад українською у цьому контексті",
  "part_of_speech": "іменник/дієслово/прикметник тощо",
  "synonyms": ["2-4", "популярні", "датські", "синоніми"],
  "explanation_uk": "короткий граматичний коментар (інфінітив/рід/час) за потреби"
}`;

    try {
      const url = `${GEMINI_API_ENDPOINT}/${model}:generateContent?key=${apiKey.trim()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        if (local) {
          return {
            word,
            word_clean: clean,
            translation_uk: local.translation,
            synonyms: local.synonyms || [],
            part_of_speech: local.pos,
            explanation_uk: local.explanation,
          };
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data: GeminiResponse = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Порожня відповідь');

      const parsed = JSON.parse(cleanJsonString(rawText));
      return {
        word,
        word_clean: clean,
        translation_uk: parsed.translation_uk || (local ? local.translation : clean),
        synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : local?.synonyms || [],
        part_of_speech: parsed.part_of_speech || local?.pos,
        explanation_uk: parsed.explanation_uk || local?.explanation,
      };
    } catch (e) {
      if (local) {
        return {
          word,
          word_clean: clean,
          translation_uk: local.translation,
          synonyms: local.synonyms || [],
          part_of_speech: local.pos,
          explanation_uk: local.explanation,
        };
      }
      return {
        word,
        word_clean: clean,
        translation_uk: 'Помилка перекладу',
        synonyms: [],
      };
    }
  }

  /**
   * Translates a selected phrase or full sentence to Ukrainian.
   */
  static async translatePhrase({
    apiKey,
    model = DEFAULT_MODEL,
    phrase,
  }: {
    apiKey: string;
    model?: string;
    phrase: string;
  }): Promise<string> {
    if (!apiKey?.trim()) {
      return '(Потрібен API ключ Gemini для перекладу речень)';
    }

    const prompt = `Переклади дану датську фразу чи речення на природну українську мову без лапок і коментарів:
"${phrase}"`;

    try {
      const url = `${GEMINI_API_ENDPOINT}/${model}:generateContent?key=${apiKey.trim()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      });

      if (!res.ok) {
        return 'Не вдалося перекласти фразу.';
      }

      const data: GeminiResponse = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return rawText ? rawText.trim() : phrase;
    } catch {
      return 'Помилка мережі при перекладі.';
    }
  }
}
