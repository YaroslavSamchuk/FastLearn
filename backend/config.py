import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "fastlearn")
DEFAULT_VOICE = os.getenv("DEFAULT_VOICE", "da-DK-ChristelNeural")
ALT_VOICE = os.getenv("ALT_VOICE", "da-DK-JeppeNeural")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))

AUDIO_CACHE_DIR = BASE_DIR / "backend" / "cache" / "audio"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
