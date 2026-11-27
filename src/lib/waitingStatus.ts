// language: TypeScript, file: src/lib/waitingStatus.ts, target: Web / Mobile Browser

export type WaitingPhase = 'thinking' | 'searching' | 'analyzing' | 'memory';

export interface AssistantStatusEvent {
  phase: WaitingPhase;
  tools?: string[];
  sources?: string[];
  count?: number;
}

export interface WaitingState {
  phase: WaitingPhase;
  tools: string[];
  sources: string[];
  count: number;
  completedSearches: number;
  lastStepLabel: string;
}

const SOURCE_LABELS: Record<string, string> = {
  github: 'GitHub',
  reddit: 'Reddit',
  wikinews: 'Wikinews',
  news: 'Новини',
  hackernews: 'Hacker News',
  stackoverflow: 'Stack Overflow',
  lemmy: 'Lemmy',
  huggingface: 'Hugging Face',
  arxiv: 'arXiv',
  npm: 'npm',
  devto: 'Dev.to',
  wikipedia: 'Wikipedia'
};

export function createInitialWaitingState(): WaitingState {
  return {
    phase: 'thinking',
    tools: [],
    sources: [],
    count: 0,
    completedSearches: 0,
    lastStepLabel: ''
  };
}

function formatQueryCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} запит`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} запити`;
  return `${count} запитів`;
}

function formatSearchLabel(tools: string[], sources: string[], count: number): string {
  const unique = Array.from(new Set(tools));
  if (unique.length === 1) {
    const only = unique[0];
    if (only === 'wiki_page') return 'Читає статтю у Вікіпедії';
    if (only === 'wiki_search') return 'Шукає у Вікіпедії';
    if (only === 'fetch_url') return 'Читає сторінку';
    if (only === 'news_search') return 'Перевіряє новини';
    if (only === 'research_topic') return 'Досліджує тему';
    if (only === 'media_search') {
      const namedSources = sources
        .map((src) => SOURCE_LABELS[src] || src)
        .filter(Boolean)
        .slice(0, 2);
      if (namedSources.length > 0 && count <= 1) {
        return `Шукає в медіа · ${namedSources.join(', ')}`;
      }
      return count > 1 ? `Шукає в медіа · ${formatQueryCount(count)}` : 'Шукає в медіа';
    }
  }

  if (unique.length > 0 && unique.every((t) => t === 'wiki_search' || t === 'wiki_page')) {
    return count > 1 ? `Шукає у Вікіпедії · ${formatQueryCount(count)}` : 'Шукає у Вікіпедії';
  }

  return count > 1 ? `Шукає в мережі · ${formatQueryCount(count)}` : 'Шукає в мережі';
}

export function reduceWaitingState(
  prev: WaitingState,
  event: AssistantStatusEvent
): WaitingState {
  const tools = Array.isArray(event.tools) ? event.tools : prev.tools;
  const sources = Array.isArray(event.sources) ? event.sources : prev.sources;
  const count = typeof event.count === 'number' && event.count > 0 ? event.count : tools.length;

  if (event.phase === 'thinking') {
    return {
      ...prev,
      phase: 'thinking',
      tools: [],
      sources: [],
      count: 0
    };
  }

  if (event.phase === 'searching') {
    return {
      ...prev,
      phase: 'searching',
      tools,
      sources,
      count,
      lastStepLabel: formatSearchLabel(tools, sources, count)
    };
  }

  if (event.phase === 'analyzing') {
    const stepTotal = prev.completedSearches + Math.max(1, count || prev.count || 1);
    return {
      ...prev,
      phase: 'analyzing',
      tools,
      sources,
      count,
      completedSearches: stepTotal,
      lastStepLabel: prev.lastStepLabel || formatSearchLabel(tools, sources, count)
    };
  }

  return {
    ...prev,
    phase: 'memory'
  };
}

export function describeWaitingState(state: WaitingState): {
  label: string;
  trail: string | null;
  icon: 'brand' | 'web' | 'wiki' | 'news' | 'page';
} {
  if (state.phase === 'searching') {
    const unique = Array.from(new Set(state.tools));
    let icon: 'web' | 'wiki' | 'news' | 'page' = 'web';
    if (unique.length > 0 && unique.every((t) => t === 'wiki_search' || t === 'wiki_page')) {
      icon = 'wiki';
    } else if (unique.length === 1 && unique[0] === 'news_search') {
      icon = 'news';
    } else if (unique.length === 1 && unique[0] === 'fetch_url') {
      icon = 'page';
    }

    return {
      label: formatSearchLabel(state.tools, state.sources, state.count),
      trail:
        state.completedSearches > 0
          ? `Перевірено ${formatQueryCount(state.completedSearches)}`
          : null,
      icon
    };
  }

  if (state.phase === 'analyzing') {
    return {
      label: 'Аналізує результати',
      trail:
        state.completedSearches > 0
          ? `Перевірено ${formatQueryCount(state.completedSearches)}`
          : null,
      icon: 'brand'
    };
  }

  if (state.phase === 'memory') {
    return {
      label: 'Пам’ять оновлено · думає',
      trail:
        state.completedSearches > 0
          ? `Перевірено ${formatQueryCount(state.completedSearches)}`
          : null,
      icon: 'brand'
    };
  }

  return {
    label: state.completedSearches > 0 ? 'Готує відповідь' : 'Думає',
    trail:
      state.completedSearches > 0
        ? `Перевірено ${formatQueryCount(state.completedSearches)}`
        : null,
    icon: 'brand'
  };
}
