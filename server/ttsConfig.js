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
