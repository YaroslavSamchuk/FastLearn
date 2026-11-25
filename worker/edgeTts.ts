type SocketEvent = Event | MessageEvent | CloseEvent | { error?: unknown; code?: number };
type SocketHandler = ((event: SocketEvent) => void) | null;
type SocketListener = (...args: unknown[]) => void;

class WorkerFetchWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = WorkerFetchWebSocket.CONNECTING;
  binaryType: BinaryType = 'blob';
  onopen: SocketHandler = null;
  onmessage: SocketHandler = null;
  onerror: SocketHandler = null;
  onclose: SocketHandler = null;
  private socket: WebSocket | null = null;
  private listeners = new Map<string, Set<SocketListener>>();

  constructor(url: string, options?: { headers?: Record<string, string> }) {
    void this.connect(url, options?.headers ?? {});
  }

  private async connect(url: string, headers: Record<string, string>): Promise<void> {
    try {
      const response = await fetch(url.replace(/^wss:/, 'https:'), {
        headers: { ...headers, Upgrade: 'websocket' }
      });
      if (response.status !== 101 || !response.webSocket) {
        throw new Error(`Edge TTS WebSocket returned HTTP ${response.status}`);
      }

      const socket = response.webSocket;
      this.socket = socket;
      socket.binaryType = this.binaryType;
      socket.addEventListener('open', (event) => {
        if (this.readyState !== WorkerFetchWebSocket.CONNECTING) return;
        this.readyState = WorkerFetchWebSocket.OPEN;
        this.emit('open', event);
      });
      socket.addEventListener('message', (event) => this.emit('message', event));
      socket.addEventListener('error', (event) => this.emit('error', event));
      socket.addEventListener('close', (event) => {
        this.readyState = WorkerFetchWebSocket.CLOSED;
        this.emit('close', event);
      });
      socket.accept();

      if (this.readyState === WorkerFetchWebSocket.CONNECTING) {
        this.readyState = WorkerFetchWebSocket.OPEN;
        this.emit('open', new Event('open'));
      } else if (this.readyState === WorkerFetchWebSocket.CLOSING) {
        socket.close();
      }
    } catch (error) {
      this.readyState = WorkerFetchWebSocket.CLOSED;
      this.emit('error', { error });
    }
  }

  private emit(type: string, event: SocketEvent): void {
    const handler = this[`on${type}` as 'onopen' | 'onmessage' | 'onerror' | 'onclose'];
    handler?.(event);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  once(type: string, listener: SocketListener): this {
    const wrapper: SocketListener = (...args) => {
      this.listeners.get(type)?.delete(wrapper);
      listener(...args);
    };
    const listeners = this.listeners.get(type) ?? new Set<SocketListener>();
    listeners.add(wrapper);
    this.listeners.set(type, listeners);
    return this;
  }

  send(data: string, callback?: (error?: Error) => void): void {
    try {
      if (!this.socket || this.readyState !== WorkerFetchWebSocket.OPEN) {
        throw new Error('Edge TTS WebSocket is not open.');
      }
      this.socket.send(data);
      callback?.();
    } catch (error) {
      const sendError = error instanceof Error ? error : new Error(String(error));
      if (callback) callback(sendError);
      else throw sendError;
    }
  }

  close(): void {
    this.readyState = WorkerFetchWebSocket.CLOSING;
    this.socket?.close();
  }
}

let edgeTtsModule: Promise<typeof import('msedge-tts')> | undefined;

async function loadEdgeTts(): Promise<typeof import('msedge-tts')> {
  if (!edgeTtsModule) {
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = WorkerFetchWebSocket as unknown as typeof WebSocket;
    edgeTtsModule = import('msedge-tts')
      .catch((error: unknown) => {
        edgeTtsModule = undefined;
        throw error;
      })
      .finally(() => {
        globalThis.WebSocket = originalWebSocket;
      });
  }
  return edgeTtsModule;
}

async function synthesizeEdgeSpeechOnce(
  text: string,
  language: 'da' | 'en',
  speed: number
): Promise<Uint8Array> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await loadEdgeTts();
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 8_000, synthesisTimeoutMs: 14_000 });
  try {
    const voice = language === 'da' ? 'da-DK-JeppeNeural' : 'en-US-JennyNeural';
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text, { rate: speed, pitch: '+0Hz' });
    const chunks: Uint8Array[] = [];
    for await (const chunk of audioStream) chunks.push(new Uint8Array(chunk));
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    if (size === 0) throw new Error('Edge TTS returned an empty audio stream');

    const audio = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      audio.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return audio;
  } finally {
    tts.close();
  }
}

export async function synthesizeEdgeSpeech(
  text: string,
  language: 'da' | 'en',
  speed: number
): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await synthesizeEdgeSpeechOnce(text, language, speed);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
