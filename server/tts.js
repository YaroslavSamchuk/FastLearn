import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Voice registry for Danish and English
export const VOICES = {
  da: {
    female: 'da-DK-ChristelNeural',
    male: 'da-DK-JeppeNeural',
    default: 'da-DK-ChristelNeural'
  },
  en: {
    female: 'en-US-JennyNeural',
    male: 'en-US-GuyNeural',
    default: 'en-US-JennyNeural'
  }
};

// Map multiplier to Edge TTS rate string
export function mapSpeedToRate(speed) {
  const num = parseFloat(speed);
  if (isNaN(num)) return '-20%'; // default 0.80x
  
  if (Math.abs(num - 0.60) < 0.03) return '-40%';
  if (Math.abs(num - 0.80) < 0.03) return '-20%';
  if (Math.abs(num - 0.85) < 0.03) return '-15%';
  if (Math.abs(num - 1.00) < 0.03) return '+0%';
  
  const percentage = Math.round((num - 1.0) * 100);
  return `${percentage >= 0 ? '+' : ''}${percentage}%`;
}

export async function synthesizeEdgeSpeech(text, lang = 'da', speed = 0.80, voiceName = null) {
  const tts = new MsEdgeTTS();
  const selectedVoice = voiceName || VOICES[lang]?.default || VOICES.en.default;
  const rate = mapSpeedToRate(speed);

  await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  
  const stream = await tts.toStream(text.trim(), {
    rate,
    pitch: '+0Hz'
  });

  return stream.audioStream;
}
