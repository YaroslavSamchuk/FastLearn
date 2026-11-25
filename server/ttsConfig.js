export const TTS_VOICES = {
  da: [
    { id: 'da-DK-JeppeNeural', label: 'Jeppe', hint: 'Чоловічий · DK' },
    { id: 'da-DK-ChristelNeural', label: 'Christel', hint: 'Жіночий · DK' }
  ],
  en: [
    { id: 'en-US-JennyNeural', label: 'Jenny', hint: 'Жіночий · US' },
    { id: 'en-US-AndrewNeural', label: 'Andrew', hint: 'Чоловічий · US' },
    { id: 'en-US-AvaNeural', label: 'Ava', hint: 'Жіночий · US' },
    { id: 'en-US-GuyNeural', label: 'Guy', hint: 'Чоловічий · US' },
    { id: 'en-GB-SoniaNeural', label: 'Sonia', hint: 'Жіночий · UK' },
    { id: 'en-GB-RyanNeural', label: 'Ryan', hint: 'Чоловічий · UK' }
  ]
};

export const DEFAULT_VOICES = {
  da: 'da-DK-JeppeNeural',
  en: 'en-US-JennyNeural'
};

export const MIN_PLAYBACK_SPEED = 0.5;
export const MAX_PLAYBACK_SPEED = 1.5;
export const PLAYBACK_SPEED_STEP = 0.05;
export const DEFAULT_PLAYBACK_SPEEDS = {
  da: [1, 0.7, 0.5],
  en: [1, 0.7, 0.5]
};

export function normalizeSpeedValue(value, fallback = 1) {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.max(MIN_PLAYBACK_SPEED, Math.min(MAX_PLAYBACK_SPEED, numeric));
  const rounded = Math.round(clamped / PLAYBACK_SPEED_STEP) * PLAYBACK_SPEED_STEP;
  return Number(rounded.toFixed(2));
}

export function normalizeSpeedTuple(input, fallback = DEFAULT_PLAYBACK_SPEEDS.da) {
  const source = Array.isArray(input) ? input : [];
  return [
    normalizeSpeedValue(source[0], fallback[0]),
    normalizeSpeedValue(source[1], fallback[1]),
    normalizeSpeedValue(source[2], fallback[2])
  ];
}

export function normalizePlaybackSpeeds(input) {
  const raw = input && typeof input === 'object' ? input : {};
  return {
    da: normalizeSpeedTuple(raw.da, DEFAULT_PLAYBACK_SPEEDS.da),
    en: normalizeSpeedTuple(raw.en, DEFAULT_PLAYBACK_SPEEDS.en)
  };
}

export function isValidVoice(language, voice) {
  if (typeof voice !== 'string' || !voice) return false;
  const list = TTS_VOICES[language === 'en' ? 'en' : 'da'];
  return list.some((item) => item.id === voice);
}

export function resolveVoice(language, voice) {
  const lang = language === 'en' ? 'en' : 'da';
  return isValidVoice(lang, voice) ? voice : DEFAULT_VOICES[lang];
}

export function normalizeVoices(input) {
  const raw = input && typeof input === 'object' ? input : {};
  return {
    da: resolveVoice('da', raw.da),
    en: resolveVoice('en', raw.en)
  };
}
