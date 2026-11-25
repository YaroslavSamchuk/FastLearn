export interface EdgeAgentProfile {
  id: string;
  userAgent: string;
  secMsGecVersion: string;
  acceptLanguage: string;
}

export const EDGE_TRUSTED_CLIENT_TOKEN: string;
export const EDGE_CHROMIUM_VERSION: string;
export const EDGE_SEC_MS_GEC_VERSION: string;
export const EDGE_USER_AGENT: string;
export const EDGE_ORIGIN: string;
export const EDGE_OUTPUT_FORMAT: string;
export const EDGE_AGENT_PROFILES: readonly EdgeAgentProfile[];

export function markAgentCooldown(endpoint: string, agentId: string, ttlMs?: number): void;
export function isAgentInCooldown(endpoint: string, agentId: string): boolean;
export function hasHealthyAgent(endpoint: string): boolean;
export function pickEdgeAgent(endpoint?: string, excludeIds?: Set<string>): EdgeAgentProfile;
export function hashSecMsGecV2(ticksAndToken: string): Promise<string>;
export function generateSecMsGec(clockOffsetMs?: number): Promise<string>;
export function generateRequestId(): string;
export function buildEdgeWsUrl(
  endpoint?: 'bing' | 'apim',
  clockOffsetMs?: number,
  secMsGecVersion?: string
): Promise<string>;
export function buildEdgeWsConnection(
  endpoint?: 'bing' | 'apim',
  clockOffsetMs?: number,
  excludeIds?: Set<string>
): Promise<{ agent: EdgeAgentProfile; url: string; headers: Record<string, string> }>;
export function escapeSsmlText(text: string): string;
export function formatSsmlRate(speed: number): string;
export function buildSpeechConfigMessage(outputFormat?: string): string;
export function buildEdgeSsmlMessage(requestId: string, text: string, voice: string, speed: number): string;
export function parseEdgeBinaryAudioFrame(data: unknown): { requestId: string; audio: Uint8Array } | null;
export function concatUint8Arrays(chunks: readonly Uint8Array[]): Uint8Array;
export function synthesizeBingTranslatorTts(
  text: string,
  voice: string,
  speed: number,
  timeoutMs?: number
): Promise<Uint8Array>;
