export class SpeechService {
  private static synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private static cachedVoice: SpeechSynthesisVoice | null = null;
  private static voicesLoaded: boolean = false;

  private static initVoices(): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (voices && voices.length > 0) {
      this.cachedVoice = this.findDanishVoice(voices);
      this.voicesLoaded = true;
    } else {
      this.synth.onvoiceschanged = () => {
        if (!this.synth) return;
        const updated = this.synth.getVoices();
        this.cachedVoice = this.findDanishVoice(updated);
        this.voicesLoaded = true;
      };
    }
  }

  private static findDanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    // 1. Look for high quality / neural Danish voices first
    const daVoices = voices.filter(v => v.lang.toLowerCase().startsWith('da'));
    if (daVoices.length === 0) return null;

    // Prefer Danish neural or natural voices
    const preferred = daVoices.find(v =>
      v.name.includes('Neural') ||
      v.name.includes('Natural') ||
      v.name.includes('Christel') ||
      v.name.includes('Jeppe') ||
      v.name.includes('Sara')
    );

    return preferred || daVoices[0];
  }

  static isAvailable(): boolean {
    return Boolean(this.synth);
  }

  static getDanishVoice(): SpeechSynthesisVoice | null {
    if (!this.voicesLoaded) {
      this.initVoices();
    }
    return this.cachedVoice;
  }

  static stop(): void {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (_) {}
    }
  }

  static speak(
    text: string,
    options?: {
      rate?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    }
  ): void {
    if (!this.synth) {
      console.warn('Web Speech API is not supported in this browser.');
      options?.onError?.(new Error('Speech not supported'));
      return;
    }

    const clean = text.trim();
    if (!clean) return;

    // Cancel current speech to prevent overlapping queues
    this.stop();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'da-DK';
    utterance.rate = options?.rate || 1.0;

    const voice = this.getDanishVoice();
    if (voice) {
      utterance.voice = voice;
    }

    if (options?.onStart) utterance.onstart = options.onStart;
    if (options?.onEnd) utterance.onend = options.onEnd;
    if (options?.onError) utterance.onerror = options.onError;

    // Workaround for Chromium engine speech pausing bug on long text
    this.synth.speak(utterance);
  }
}
