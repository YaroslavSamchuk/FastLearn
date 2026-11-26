// language: TypeScript, file: worker/edgeTts.ts, target: Cloudflare Workers
import { resolveVoice } from '../server/ttsConfig.js';
import {
  buildEdgeSsmlMessage,
  buildEdgeWsConnection,
  buildEdgeWsUrl,
  buildSpeechConfigMessage,
  concatUint8Arrays,
  generateRequestId,
  hasHealthyAgent,
  markAgentCooldown,
  parseEdgeBinaryAudioFrame,
  synthesizeBingTranslatorTts
} from '../server/ttsProviders.js';

type EdgeEndpoint = 'bing' | 'apim';

interface PendingTurn {
  speed: number;
  chunks: Uint8Array[];
  timer: ReturnType<typeof setTimeout>;
  resolve: (audio: Uint8Array) => void;
  reject: (error: Error) => void;
}

export interface SynthSpeechResult {
  audio: Uint8Array;
  source: string;
  voice: string;
}

export interface BatchSynthVariant {
  speed: number;
  audio: Uint8Array;
  source: string;
  voice: string;
}

class EdgeHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let clockOffsetMs = 0;

function isChristelVoice(voice: string): boolean {
  return voice === 'da-DK-ChristelNeural';
}

async function openEdgeWebSocket(
  endpoint: EdgeEndpoint,
  timeoutMs = 2_200
): Promise<{ socket: WebSocket; agentId: string }> {
  const triedAgents = new Set<string>();
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { agent, url, headers } = await buildEdgeWsConnection(endpoint, clockOffsetMs, triedAgents);
    triedAgents.add(agent.id);

    for (let clockAttempt = 0; clockAttempt < 2; clockAttempt += 1) {
      const targetUrl =
        clockAttempt === 0 ? url : await buildEdgeWsUrl(endpoint, clockOffsetMs, agent.secMsGecVersion);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(targetUrl.replace(/^wss:/, 'https:'), {
          headers,
          signal: controller.signal
        });

        if (response.status === 403 && clockAttempt === 0) {
          const serverDate = response.headers.get('date');
          const serverMs = serverDate ? Date.parse(serverDate) : Number.NaN;
          if (Number.isFinite(serverMs)) {
            clockOffsetMs = serverMs - Date.now();
            continue;
          }
        }

        if (response.status === 429 || response.status === 403) {
          markAgentCooldown(endpoint, agent.id);
          lastError = new EdgeHttpError(
            response.status,
            `Edge TTS WebSocket (${endpoint}/${agent.id}) returned HTTP ${response.status}`
          );
          break;
        }

        if (response.status !== 101 || !response.webSocket) {
          lastError = new EdgeHttpError(
            response.status,
            `Edge TTS WebSocket (${endpoint}/${agent.id}) returned HTTP ${response.status}`
          );
          break;
        }

        const socket = response.webSocket;
        socket.binaryType = 'arraybuffer';
        socket.accept();
        socket.send(buildSpeechConfigMessage());
        return { socket, agentId: agent.id };
      } catch (error) {
        markAgentCooldown(endpoint, agent.id, 15_000);
        lastError = error;
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Edge TTS WebSocket (${endpoint}) handshake failed`);
}

async function synthesizeViaWebSocket(
  endpoint: EdgeEndpoint,
  text: string,
  voice: string,
  speeds: readonly number[],
  mode: 'concurrent' | 'sequential',
  onSpeedReady?: (speed: number, audio: Uint8Array) => void | Promise<void>
): Promise<Map<number, Uint8Array>> {
  const { socket, agentId } = await openEdgeWebSocket(endpoint, 2_200);
  const pending = new Map<string, PendingTurn>();
  const completed = new Map<number, Uint8Array>();

  const failPending = (error: Error, coolAgent = false) => {
    if (coolAgent && pending.size > 0) {
      markAgentCooldown(endpoint, agentId, 20_000);
    }
    for (const [reqId, turn] of pending.entries()) {
      clearTimeout(turn.timer);
      pending.delete(reqId);
      turn.reject(error);
    }
  };

  socket.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (typeof data === 'string') {
      const requestId = /X-RequestId:([^\r\n]+)/.exec(data)?.[1]?.trim();
      if (!requestId) return;
      const turn = pending.get(requestId);
      if (!turn) return;

      if (data.includes('Path:turn.end')) {
        clearTimeout(turn.timer);
        pending.delete(requestId);
        const audio = concatUint8Arrays(turn.chunks);
        if (audio.byteLength === 0) {
          turn.reject(new Error('Edge TTS returned an empty audio stream'));
          return;
        }
        completed.set(turn.speed, audio);
        turn.resolve(audio);
      }
      return;
    }

    const frame = parseEdgeBinaryAudioFrame(data);
    if (!frame) return;
    const turn = pending.get(frame.requestId);
    if (!turn) return;
    turn.chunks.push(frame.audio);
  });

  socket.addEventListener('close', () => {
    failPending(
      new Error('Stream closed before the synthesis completed (no turn.end received). The audio is likely truncated.'),
      true
    );
  });

  socket.addEventListener('error', () => {
    failPending(new Error(`Edge TTS WebSocket (${endpoint}) error`), true);
  });

  const sendSingleSpeed = (speed: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const requestId = generateRequestId();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        markAgentCooldown(endpoint, agentId, 20_000);
        reject(new Error(`Edge TTS (${endpoint}) timed out waiting for audio`));
      }, 4_000);

      pending.set(requestId, {
        speed,
        chunks: [],
        timer,
        resolve: async (audio) => {
          try {
            await onSpeedReady?.(speed, audio);
            resolve();
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
        reject
      });

      try {
        socket.send(buildEdgeSsmlMessage(requestId, text, voice, speed));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

  try {
    if (mode === 'sequential') {
      for (const speed of speeds) {
        await sendSingleSpeed(speed);
      }
    } else {
      await Promise.allSettled(speeds.map((speed) => sendSingleSpeed(speed)));
    }
  } finally {
    failPending(new Error('Edge TTS session ended'));
    try {
      socket.close(1000, 'done');
    } catch {
      // Socket already closed.
    }
  }

  return completed;
}

export async function synthesizeEdgeSpeech(
  text: string,
  language: 'da' | 'en',
  speed: number,
  voiceName?: string | null
): Promise<SynthSpeechResult> {
  const voice = resolveVoice(language, voiceName);
  const errors: string[] = [];

  if (hasHealthyAgent('apim')) {
    try {
      const res = await synthesizeViaWebSocket('apim', text, voice, [speed], 'sequential');
      const audio = res.get(speed);
      if (audio) return { audio, source: 'apim', voice };
    } catch (error) {
      errors.push(`apim:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await synthesizeViaWebSocket('bing', text, voice, [speed], 'sequential');
      const audio = res.get(speed);
      if (audio) return { audio, source: attempt === 1 ? 'edge' : 'edge-retry', voice };
    } catch (error) {
      errors.push(`bing-${attempt}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (hasHealthyAgent('bing-http')) {
    try {
      const audio = await synthesizeBingTranslatorTts(text, voice, speed, 4_500);
      return { audio, source: 'bing-http', voice };
    } catch (error) {
      errors.push(`bing-http:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (isChristelVoice(voice)) {
    const fallbackVoice = 'da-DK-JeppeNeural';
    try {
      const res = await synthesizeViaWebSocket('bing', text, fallbackVoice, [speed], 'sequential');
      const audio = res.get(speed);
      if (audio) return { audio, source: 'edge-fallback', voice: fallbackVoice };
    } catch (error) {
      errors.push(`jeppe-ws:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(' | ') || 'Edge TTS unavailable');
}

export async function synthesizeEdgeSpeechBatch(
  text: string,
  language: 'da' | 'en',
  speeds: readonly number[],
  voiceName: string | null | undefined,
  onVariantReady: (variant: BatchSynthVariant) => void | Promise<void>
): Promise<number[]> {
  const voice = resolveVoice(language, voiceName);
  const missing = new Set(speeds);

  const emitDone = async (speed: number, audio: Uint8Array, source: string, usedVoice: string) => {
    missing.delete(speed);
    await onVariantReady({ speed, audio, source, voice: usedVoice });
  };

  if (hasHealthyAgent('apim')) {
    try {
      await synthesizeViaWebSocket('apim', text, voice, [...missing], 'sequential', async (speed, audio) => {
        await emitDone(speed, audio, 'apim', voice);
      });
    } catch {
      // Remaining speeds fall through immediately.
    }
  }

  if (missing.size > 0) {
    try {
      await synthesizeViaWebSocket('bing', text, voice, [...missing], 'concurrent', async (speed, audio) => {
        await emitDone(speed, audio, 'edge', voice);
      });
    } catch {
      // Remaining speeds fall through immediately.
    }
  }

  if (missing.size > 0) {
    try {
      await synthesizeViaWebSocket('bing', text, voice, [...missing], 'sequential', async (speed, audio) => {
        await emitDone(speed, audio, 'edge-retry', voice);
      });
    } catch {
      // Remaining speeds fall through to Microsoft Bing HTTP fallback.
    }
  }

  if (missing.size > 0 && hasHealthyAgent('bing-http')) {
    await Promise.allSettled(
      [...missing].map(async (speed) => {
        const audio = await synthesizeBingTranslatorTts(text, voice, speed, 4_500);
        await emitDone(speed, audio, 'bing-http', voice);
      })
    );
  }

  if (missing.size > 0 && isChristelVoice(voice)) {
    const fallbackVoice = 'da-DK-JeppeNeural';
    try {
      await synthesizeViaWebSocket(
        'bing',
        text,
        fallbackVoice,
        [...missing],
        'concurrent',
        async (speed, audio) => {
          await emitDone(speed, audio, 'edge-fallback', fallbackVoice);
        }
      );
    } catch {
      // Any remaining speeds reported back to caller.
    }
  }

  return [...missing];
}
