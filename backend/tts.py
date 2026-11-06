import asyncio
import hashlib
import logging
import re
import uuid
from pathlib import Path
from typing import Optional, Dict
import edge_tts
from backend.config import AUDIO_CACHE_DIR, DEFAULT_VOICE, ALT_VOICE

logger = logging.getLogger("fastlearn.tts")

SUPPORTED_VOICES = {
    "christel": "da-DK-ChristelNeural",
    "jeppe": "da-DK-JeppeNeural"
}

# Deduplicate concurrent in-flight requests for the same audio
_IN_FLIGHT_TASKS: Dict[str, asyncio.Future] = {}

class TTSService:
    def __init__(self):
        self.cache_dir = AUDIO_CACHE_DIR
        self.default_voice = DEFAULT_VOICE
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _clean_text(self, text: str) -> str:
        # Strip outer quotes, brackets, and extra punctuation that trips up TTS
        cleaned = text.strip()
        cleaned = re.sub(r'^[^\wæøåÆØÅéÉ0-9]+|[^\wæøåÆØÅéÉ0-9.!?]+$', '', cleaned).strip()
        return cleaned or text.strip()

    def _get_cache_path(self, text: str, voice: str) -> Path:
        key = f"{voice}:{text.strip()}".encode("utf-8")
        h = hashlib.sha256(key).hexdigest()
        return self.cache_dir / f"{h}.mp3"

    async def get_or_generate_audio(self, text: str, voice: Optional[str] = None, max_retries: int = 3) -> Path:
        raw_text = text.strip()
        if not raw_text:
            raise ValueError("Text cannot be empty for TTS")

        selected_voice = voice or self.default_voice
        if selected_voice.lower() in SUPPORTED_VOICES:
            selected_voice = SUPPORTED_VOICES[selected_voice.lower()]

        # Clean text for synthesis while keeping exact cache path for requested text
        spoken_text = self._clean_text(raw_text)
        if not any(c.isalnum() for c in spoken_text):
            raise ValueError("No speakable text found")

        cache_file = self._get_cache_path(raw_text, selected_voice)
        if cache_file.exists() and cache_file.stat().st_size > 0:
            return cache_file

        task_key = f"{selected_voice}:{raw_text}"

        # If another request is currently generating this exact audio, wait for it!
        if task_key in _IN_FLIGHT_TASKS:
            try:
                return await _IN_FLIGHT_TASKS[task_key]
            except Exception:
                pass  # Fall through to retry

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        _IN_FLIGHT_TASKS[task_key] = future

        try:
            logger.info(f"Generating TTS for: '{spoken_text[:35]}...' with voice {selected_voice}")
            last_error = None
            for attempt in range(1, max_retries + 1):
                tmp_file = self.cache_dir / f"{cache_file.stem}_{uuid.uuid4().hex[:6]}.tmp"
                try:
                    communicate = edge_tts.Communicate(spoken_text, selected_voice)
                    await communicate.save(str(tmp_file))

                    if tmp_file.exists() and tmp_file.stat().st_size > 0:
                        tmp_file.replace(cache_file)
                        future.set_result(cache_file)
                        return cache_file
                except Exception as e:
                    last_error = e
                    logger.warning(f"Edge TTS attempt {attempt}/{max_retries} failed for '{spoken_text[:20]}': {e}")
                    if tmp_file.exists():
                        tmp_file.unlink(missing_ok=True)
                    if attempt < max_retries:
                        await asyncio.sleep(0.3 * attempt)

            err_msg = f"Edge TTS completely failed after {max_retries} attempts: {last_error}"
            logger.error(err_msg)
            future.set_exception(RuntimeError(err_msg))
            raise RuntimeError(err_msg)
        finally:
            _IN_FLIGHT_TASKS.pop(task_key, None)

tts_service = TTSService()
