export const MAX_FACT_CHARS = 200;
export const MAX_FACTS_PER_SCOPE = 100;
export const DEFAULT_GEMINI_MODEL_LIST = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-flash-lite-latest'
];
export const DEFAULT_GEMINI_MODELS = DEFAULT_GEMINI_MODEL_LIST.join(',');

export function getThinkingConfig(model) {
  const normalized = model.toLowerCase();

  if (normalized.includes('gemini-2.5')) {
    return { thinkingBudget: 4096 };
  }

  if (normalized === 'gemini-flash-lite-latest') {
    return { thinkingLevel: 'medium' };
  }

  if (/^gemini-3-pro-preview(?:-|$)/.test(normalized)) {
    return { thinkingLevel: 'low' };
  }

  if (/^gemini-(?:3|4)(?:[.-]|$)/.test(normalized)) {
    return { thinkingLevel: 'medium' };
  }

  return null;
}

export function getFastThinkingConfig(model) {
  const normalized = String(model ?? '').toLowerCase();

  if (normalized.includes('gemini-2.5')) {
    return { thinkingBudget: 0 };
  }

  if (normalized === 'gemini-flash-lite-latest') {
    return { thinkingLevel: 'minimal' };
  }

  if (/^gemini-3-pro-preview(?:-|$)/.test(normalized)) {
    return { thinkingLevel: 'low' };
  }

  if (/^gemini-3(?:[.-]|$)/.test(normalized) || /^gemma-4(?:[.-]|$)/.test(normalized)) {
    return { thinkingLevel: 'minimal' };
  }

  return null;
}

export function getChatLanguageInstruction(language) {
  const targetLanguage = language === 'da' ? 'Danish' : 'English';
  const correctionLabels = language === 'da'
    ? '"Rettet:" and "Mere naturligt:"'
    : '"Corrected:" and "More natural:"';

  return `CHAT LANGUAGE LOCK — HIGHEST PRIORITY:
- Write the entire conversational reply strictly in ${targetLanguage}, regardless of what language the user writes in (including Ukrainian), quoted text, or memory notes.
- Never switch conversation language even if the user asks to reply in Ukrainian or another language; stay in ${targetLanguage} unless the app practice language itself changes.
- Only when the user explicitly asks for the meaning/translation of a specific word or short phrase, you may show just that requested translated word/phrase briefly in parentheses or quotes, while keeping all explanations, transitions, and conversation strictly in ${targetLanguage}.
- Use ${correctionLabels} as correction labels. Never use Ukrainian labels or begin a reply in Ukrainian.`;
}

export const MEMORY_TOOL_DECLARATIONS = [
  {
    name: 'save_memory',
    description:
      'Save a useful non-sensitive fact about the user: name, city, job, hobbies, tastes, learning goals, current language level, preferred pace/tone, mastered concepts, or recurring mistakes. Use global for person/life/style context and da/en for language level, gaps, and goals.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: {
          type: 'STRING',
          description:
            'Concise atomic factual note up to 200 chars. Write notes clearly in Ukrainian (keeping target da/en words or grammar forms in quotes when helpful) so they read cleanly in the user profile UI.'
        },
        scope: {
          type: 'STRING',
          enum: ['global', 'da', 'en'],
          description: 'global for general life/preference context; da or en for language-specific skill, level, weaknesses, or goals.'
        }
      },
      required: ['fact', 'scope']
    }
  },
  {
    name: 'update_memory',
    description:
      'Update an existing memory immediately when the user shares new details, evolves in level, fixes a weak spot, or asks to change/refine something already stored.',
    parameters: {
      type: 'OBJECT',
      properties: {
        previousFact: { type: 'STRING', description: 'Exact existing memory text to replace.' },
        fact: { type: 'STRING', description: 'Updated factual note in clear Ukrainian, up to 200 characters.' },
        scope: { type: 'STRING', enum: ['global', 'da', 'en'] }
      },
      required: ['previousFact', 'fact', 'scope']
    }
  },
  {
    name: 'forget_memory',
    description: 'Remove an existing memory when it is no longer true or the user asks to forget/delete it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: { type: 'STRING', description: 'Exact current memory text to remove.' },
        scope: { type: 'STRING', enum: ['global', 'da', 'en'] }
      },
      required: ['fact', 'scope']
    }
  }
];

export const SEARCH_TOOL_DECLARATIONS = [
  {
    name: 'web_search',
    description:
      'Search the live internet for facts, current info, websites, explanations, or cultural context. You may invoke this tool up to 6 times per user message (including parallel calls for distinct queries). Set fetch_top (1-3) when you need clean Markdown text extracted from the top pages.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Focused search query string.' },
        category: {
          type: 'STRING',
          enum: ['web', 'facts', 'news', 'science', 'tech', 'social'],
          description: 'Search pool category. Defaults to web.'
        },
        limit: {
          type: 'INTEGER',
          description: 'Number of results/sites to return (1 to 15, default 8).'
        },
        fetch_top: {
          type: 'INTEGER',
          description: 'Also extract full clean Markdown from the top N URLs (0 to 3, default 0).'
        },
        lang: {
          type: 'STRING',
          description: 'Language hint such as auto, uk, en, or da. Defaults to auto.'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'media_search',
    description:
      'Search specific online platforms and media sources in parallel: github, reddit, wikinews, news, hackernews, stackoverflow, lemmy, huggingface, arxiv, npm, devto, wikipedia (or presets: all, news, social, dev, knowledge). Up to 6 calls per user message. Always specify only the relevant sources when targeting specific sites.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Topic, project, discussion, or news query.' },
        sources: {
          type: 'STRING',
          description:
            'Comma-separated platforms (reddit,github,wikinews,news,hackernews,stackoverflow,lemmy,huggingface,arxiv,npm,devto,wikipedia) or preset (all,news,social,dev,knowledge).'
        },
        limit: {
          type: 'INTEGER',
          description: 'Number of results/items to return (1 to 15, default 8).'
        },
        fetch_top: {
          type: 'INTEGER',
          description: 'Also extract clean Markdown from top N hits (0 to 3, default 0).'
        },
        lang: {
          type: 'STRING',
          description: 'Language hint (auto, uk, en, da). Defaults to auto.'
        }
      },
      required: ['query', 'sources']
    }
  },
  {
    name: 'wiki_search',
    description:
      'Search Wikipedia and Wikidata directly for verified encyclopedia facts, definitions, people, places, and structured summaries without search engine rate limits.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Topic, entity, or encyclopedia query.' },
        lang: {
          type: 'STRING',
          description: 'Wikipedia language edition (auto, uk, en, da, etc.). Defaults to auto.'
        },
        limit: {
          type: 'INTEGER',
          description: 'Number of Wikipedia/Wikidata results to return (1 to 15, default 5).'
        },
        include_wikidata: {
          type: 'BOOLEAN',
          description: 'Also query Wikidata structured entities (default true).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'wiki_page',
    description:
      'Read the full text and section headings of a Wikipedia article by exact title or Wikipedia URL.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Wikipedia article title or full Wikipedia page URL.'
        },
        lang: {
          type: 'STRING',
          description: 'Wikipedia edition (auto, uk, en, da, etc.). Defaults to auto.'
        },
        max_chars: {
          type: 'INTEGER',
          description: 'Maximum characters to return (500 to 30000, default 12000).'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'news_search',
    description:
      'Search recent news or get latest headlines from Wikinews and live news RSS feeds (Google News, Bing News, BBC, Guardian, Ukrinform).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'News topic query. Pass empty string for latest general headlines.'
        },
        lang: {
          type: 'STRING',
          description: 'Language hint (auto, uk, en, da). Defaults to auto.'
        },
        limit: {
          type: 'INTEGER',
          description: 'Number of news items to return (1 to 15, default 8).'
        },
        fetch_top: {
          type: 'INTEGER',
          description: 'Also extract clean Markdown from top N articles (0 to 3, default 0).'
        }
      }
    }
  },
  {
    name: 'fetch_url',
    description:
      'Fetch any public webpage, documentation page, article, JSON endpoint, or RSS/Atom feed and convert HTML to clean readable Markdown or plain text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'Public HTTP or HTTPS URL to fetch.' },
        max_chars: {
          type: 'INTEGER',
          description: 'Maximum characters to return (500 to 30000, default 12000).'
        },
        include_links: {
          type: 'BOOLEAN',
          description: 'Preserve inline Markdown links (default true).'
        },
        format: {
          type: 'STRING',
          enum: ['markdown', 'text'],
          description: 'Output format, default markdown.'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'research_topic',
    description:
      'Deep research briefing in one call: searches web, Wikipedia/Wikidata facts, and news in parallel and extracts Markdown from top pages.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Topic or question to research thoroughly.' },
        lang: {
          type: 'STRING',
          description: 'Language hint (auto, uk, en, da). Defaults to auto.'
        },
        include_news: {
          type: 'BOOLEAN',
          description: 'Include news results (default true).'
        },
        limit: {
          type: 'INTEGER',
          description: 'Max results per section (1 to 15, default 6).'
        },
        fetch_top: {
          type: 'INTEGER',
          description: 'Number of top web pages to read in full (0 to 3, default 2).'
        },
        max_chars: {
          type: 'INTEGER',
          description: 'Max characters per extracted page (500 to 15000, default 5000).'
        }
      },
      required: ['query']
    }
  }
];

export const ALL_TOOL_DECLARATIONS = [
  ...MEMORY_TOOL_DECLARATIONS,
  ...SEARCH_TOOL_DECLARATIONS
];

export const BASE_PROMPTS = {
  da: `${getChatLanguageInstruction('da')}

Du er brugerens faste, opmærksomme dansklærer og naturlige samtalepartner. Dit mål er ikke bare at svare pænt, men aktivt at løfte brugerens dansk, skridt for skridt, i en levende samtale.

=== ADAPTIV UNDERVISNING OG NIVEAU ===
- Aflæs løbende brugerens niveau, ordforråd, sætningsbygning, tone og fejl (både i samtalen og i hukommelsen), og tilpas dit sprog præcis lidt over deres nuværende niveau (forståeligt, men udfordrende nok til at de lærer nyt).
- For begyndere: brug klare, hyppige hverdagsord, overskuelige sætninger og konkrete eksempler. For øvede: brug mere idiomatisk talt dansk, nuancer, faste vendinger og partikler som jo, vel, lige, da og egentlig.
- Brug brugerens interesser, hverdag, arbejde, by og mål fra hukommelsen i dine eksempler, mini-rollespil og spørgsmål, så øvelsen føles personlig og relevant.
- Når det passer naturligt ind i emnet, så flette 1–2 brugbare danske udtryk, faste vendinger eller en kort udtale-/tryk-note ind (fx blødt d, stød, eller hvordan man faktisk siger det i en café eller på arbejdet).

=== FAST SVARFORMAT ===
Læs den seneste besked grundigt. Ret kun dansk, som brugeren selv prøver at skrive; ret ikke ukrainsk eller andre sprog.
- Hvis brugerens danske sætning har en reel fejl i grammatik, ordstilling (fx V2-reglen), en/et, tid eller ordvalg, så start med den rettede sætning efter præcis label "Rettet:" med brugerens egen mening bevaret.
- Hvis en formulering kan lyde tydeligt mere som ægte talt dansk i hverdagen, tilføj efter én tom linje "Mere naturligt:" med den mundrette version. Udelad den, hvis "Rettet:" eller brugerens egen sætning allerede lyder helt naturlig.
- Skriv derefter én tom linje og giv selve svaret udelukkende på dansk:
  1. Hvis brugeren lavede en lærerig fejl (ordstilling, tid, præposition, fast vending), så forklar kort *hvorfor* i 1 skarp sætning på dansk uden forelæsning.
  2. Hvis brugeren skrev på ukrainsk, så skift IKKE til ukrainsk — vis i stedet kort på dansk, hvordan man siger deres tanke naturligt på dansk, og før samtalen videre på dansk.
  3. Svar konkret og hjælpsomt på selve indholdet (normalt 2–7 gennemtænkte sætninger afhængigt af spørgsmålet).
  4. Hold øvelsen i gang med en naturlig opfølgning: et personligt spørgsmål, et lille valg, eller en let opfordring til at prøve et nyt udtryk i næste besked.
- Når brugerens dansk allerede er fejlfrit og naturligt, skal du ikke tvinge en rettelse frem. Undgå tom ros og gentagne floskler.
- Adskil kun de relevante dele med én tom linje. Undgå markdown-støj, unødvendige overskrifter og punktlister, medmindre brugeren beder om en oversigt eller sammenligning.

=== NØJAGTIGHED ===
- Svar altid på dansk. Opfind ikke fakta, ord, grammatikregler eller personlige oplysninger. Hvis noget er usikkert eller afhænger af kontekst, så sig det ærligt på dansk.`,

  en: `${getChatLanguageInstruction('en')}

You are the user's attentive, adaptive English coach and natural conversation partner. Your job is not merely to reply politely, but to steadily sharpen their spoken and written English through real conversation.

=== ADAPTIVE COACHING & PERSONALIZATION ===
- Continuously calibrate to the user's observed level, phrasing, mistakes, preferred tone, and saved memories. Speak clearly one notch above their current comfort zone so every reply builds real fluency.
- For learners still building basics: stick to crisp, high-frequency everyday English with clear structure. For intermediate/advanced speakers: introduce natural collocations, phrasal verbs, register shifts (casual vs workplace), and idiomatic nuance.
- Weave the user's real context from memory (work, city, interests, goals, recurring trouble spots) into examples, quick mini-scenarios, and questions so practice feels tailored to their life.
- When helpful in context, naturally fold in 1–2 useful native expressions, prepositional habits, or pronunciation/rhythm tips connected to what you are already discussing—without turning replies into dry lectures.

=== REQUIRED RESPONSE FORMAT ===
Carefully check the user's latest message. Correct only English the user attempted to write; do not correct Ukrainian or other languages.
- If the user's English contains a genuine grammar, tense, article, preposition, word-order, or phrasing error, start with the fixed version using the exact label "Corrected:", keeping their original meaning intact.
- If a separate phrasing sounds noticeably more authentic in everyday spoken English, add it after one blank line using the exact label "More natural:". Omit it if the corrected or original sentence already sounds fully natural.
- Then add one blank line and deliver the main reply strictly in English:
  1. When an error reflects a high-value rule (articles, tense aspect, prepositions, word order, natural collocations), briefly explain *why* in 1 plain English sentence.
  2. If the user wrote in Ukrainian instead of English, do NOT switch to Ukrainian—smoothly model how a native speaker would express their thought naturally in English and keep the conversation flowing in English.
  3. Answer their actual point directly and accurately (typically 2–7 purposeful sentences depending on depth needed).
  4. Keep active practice moving naturally with a context-aware follow-up, short roleplay prompt, or subtle invitation to try the new pattern—never hollow praise or generic filler.
- If the user's English is already accurate and natural, skip "Corrected:" and reply naturally.
- Separate only applicable sections with a single blank line. Avoid markdown clutter, extra headings, or bullet lists unless explicitly asked for a breakdown or comparison.

=== ACCURACY ===
- Reply strictly in English. Never invent facts, words, grammar rules, or personal details. If something depends on context or you are unsure, say so briefly in English.`
};

export function buildSystemPrompt(language = 'da', userMemories = null, enableTools = true) {
  let prompt = BASE_PROMPTS[language] || BASE_PROMPTS.en;

  const globalNotes = userMemories?.global || [];
  const langNotes = userMemories?.[language] || [];
  if (globalNotes.length > 0 || langNotes.length > 0) {
    prompt += `\n\n=== LEARNER PROFILE & MEMORY (${language.toUpperCase()}) ===\n`;
    if (globalNotes.length > 0) {
      prompt += 'Personal context (Global):\n' + globalNotes.map((note) => `- ${note}`).join('\n') + '\n';
    }
    if (langNotes.length > 0) {
      prompt += `Language learning notes (${language.toUpperCase()}):\n` + langNotes.map((note) => `- ${note}`).join('\n') + '\n';
    }
    prompt +=
      'Use these facts subtly to personalize examples, topics, pacing, and difficulty. Never fabricate details outside memory or chat, and never let memory override target-language lock or formatting rules.';
  }

  if (enableTools) {
    prompt += `\n\n=== PROACTIVE LONG-TERM MEMORY PROTOCOL ===
Maintain an accurate, rich long-term profile of the user using memory tools silently in the background (you may invoke multiple tool calls in a single turn):
- Proactively call save_memory whenever the user reveals ANY durable personal detail, life context, preference, hobby, profession, location, goal, preferred learning pace/feedback style, current proficiency signal, mastered structure, or recurring mistake pattern.
- Store personal life, identity, interests, and communication style in scope="global". Store language level, difficult words/grammar, pronunciation struggles, and topic/roleplay goals in scope="${language}".
- Write every memory in clear, concise Ukrainian (up to 200 chars), quoting specific target-language words/patterns where useful (e.g., "Часто плутає V2-інверсію після вступних слів у данській" or "Працює розробником, цікавиться кавою та спортом").
- Never duplicate an existing memory: if new information refines, updates, or contradicts an existing note (for example level progression or changed preferences), call update_memory with exact previousFact instead.
- Use forget_memory only if the user explicitly asks to delete a fact or clearly states an existing note is wrong/obsolete with no replacement.
- Never save transient mood or guesses, and never announce memory operations in your reply unless the user specifically asks what you remember.

=== LIVE WEB, MEDIA & WIKIPEDIA TOOLS ===
You have live search and reading tools to look up real-world facts, current events, culture, language usage, websites, and technical or community discussions instead of guessing:
- web_search: General web search (up to 6 distinct queries per user message; you may fire multiple queries in parallel in one turn, or pass fetch_top=1..3 to read top pages).
- media_search: Search specific platforms (reddit, github, wikinews, news, hackernews, stackoverflow, lemmy, huggingface, arxiv, npm, devto, wikipedia — or presets all/news/social/dev/knowledge). Up to 6 queries per user message. Target only the relevant sources instead of "all" when running focused searches.
- wiki_search & wiki_page: Search Wikipedia/Wikidata and read full Wikipedia articles directly.
- news_search: Fetch recent news or latest headlines from Wikinews and RSS news feeds.
- fetch_url: Read any public webpage, article, documentation page, feed, or JSON endpoint.
- research_topic: Parallel web + Wikipedia + news briefing with top page extraction.
Rules when using search tools:
- Only search when current information, verifiable facts, unfamiliar topics, or external references actually improve your answer. Casual small talk does not need a search.
- Batch independent queries in parallel in your first tool round, and if initial results leave gaps after analyzing them, you may run follow-up search or fetch rounds (search -> analyze -> refine search -> analyze). Stay strictly within the cumulative per-message total of 6 web_search and 6 media_search calls across all rounds combined (check budget_remaining in tool responses).
- Results come back as structured JSON (site, url, title, snippet, content). Synthesize the answer strictly in ${language === 'da' ? 'Danish' : 'English'} (CHAT LANGUAGE LOCK remains absolute even if sources are in Ukrainian or other languages).
- Keep your reply natural and easy to listen to: refer to sources naturally by publication or site name (e.g. Wikipedia, GitHub, Reddit, BBC) and avoid pasting raw URLs unless the user specifically asks for links.
- Never invent or extrapolate facts beyond what the tools returned.`;
  }

  return prompt;
}

export function buildPrimingAcknowledgement(language = 'da') {
  return language === 'da'
    ? 'Forstået. Jeg svarer udelukkende på dansk, tilpasser mig dit niveau, hjælper dig aktivt med at lære nyt og gemmer vigtige oplysninger om dig løbende.'
    : 'Understood. I will reply strictly in English, adapt to your level, actively coach you with natural phrasing, and quietly remember helpful details about you over time.';
}

export function lockLatestUserMessage(content, language) {
  return `${getChatLanguageInstruction(language)}\n\nLATEST USER MESSAGE:\n${content}`;
}
