export const DEFAULT_SEARCH_SERVERS: string[];
export const MAX_WEB_SEARCHES_PER_MESSAGE: number;
export const MAX_MEDIA_SEARCHES_PER_MESSAGE: number;
export const MAX_AUX_SEARCHES_PER_MESSAGE: number;
export const SEARCH_TOOL_NAMES: Set<string>;
export const MEDIA_PRESETS: Record<string, string[]>;
export const MEDIA_ALIASES: Record<string, string>;

export interface TurnSearchBudget {
  maxWeb: number;
  maxMedia: number;
  maxAux: number;
  webUsed: number;
  mediaUsed: number;
  auxUsed: number;
}

export interface SearchJob {
  id: number;
  kind: 'web' | 'media' | 'aux';
  sources: string[];
  isPreset?: boolean;
}

export interface SearchReservation {
  id: number;
  reservationId: string | null;
  status: 'assigned' | 'cooldown' | 'unavailable';
  kind: 'web' | 'media' | 'aux';
  serverIndex?: number;
  serverUrl?: string;
  engineName?: string | null;
  mediaSources?: string[];
  waitMs?: number | null;
}

export interface SearchRelease {
  reservationId: string | null;
  kind: 'web' | 'media' | 'aux';
  serverUrl: string;
  engineName?: string | null;
  additionalEngines?: string[];
  mediaSources?: string[];
  serverError?: boolean;
}

export interface SearchCoordinator {
  reserve(payload: {
    servers: string[];
    jobs: SearchJob[];
    statsByUrl: Record<string, unknown>;
  }): Promise<{ assignments: SearchReservation[] }>;
  release(payload: { releases: SearchRelease[] }): Promise<void>;
}

export class SearchRouterState {
  constructor(options?: {
    servers?: string[];
    cooldownMinMs?: number;
    cooldownMaxMs?: number;
    serverBackoffMs?: number;
    rng?: () => number;
  });
  syncServers(serverUrls: string[] | string): void;
  reserveBatch(
    payload: {
      servers?: string[];
      jobs: SearchJob[];
      statsByUrl?: Record<string, unknown>;
    },
    now?: number
  ): { assignments: SearchReservation[] };
  releaseBatch(releases: SearchRelease[], now?: number): void;
  snapshot(now?: number): unknown[];
}

export function parseSearchServers(rawUrls?: string): string[];
export function resolveMediaSources(rawSources?: string | string[]): string[];
export function extractSiteHost(rawUrl?: string): string;
export function prewarmSearchServers(
  serverUrls?: string[] | string,
  options?: { apiKey?: string; fetchImpl?: typeof fetch; force?: boolean }
): Promise<unknown>;
export function createTurnSearchBudget(options?: {
  maxWeb?: number;
  maxMedia?: number;
  maxAux?: number;
}): TurnSearchBudget;
export function createInMemoryCoordinator(state?: SearchRouterState): SearchCoordinator;
export const defaultSearchCoordinator: SearchCoordinator;

export function executeSearchBatch(
  calls: Array<{ name: string; args: unknown }>,
  turnBudget?: TurnSearchBudget,
  options?: {
    servers?: string[] | string;
    apiKey?: string;
    coordinator?: SearchCoordinator;
    fetchImpl?: typeof fetch;
    statsTimeoutMs?: number;
    requestTimeoutMs?: number;
    maxCooldownWaitMs?: number;
    signal?: AbortSignal;
  }
): Promise<unknown[]>;
