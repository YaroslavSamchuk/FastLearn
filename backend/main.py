import datetime
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.config import (
    PORT, HOST, GEMINI_API_KEY, GEMINI_MODEL,
    DEFAULT_VOICE, ALT_VOICE
)
from backend.database import db
from backend.tts import tts_service
from backend.translator import translator_service, fix_mojibake, is_bad_translation
from backend.ai_service import ai_service

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("fastlearn.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing FastLearn backend...")
    await db.connect()
    yield
    logger.info("Shutting down FastLearn backend...")

app = FastAPI(title="FastLearn API", version="2.0.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- SCHEMAS -----------------

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, Any]]] = []
    user_notes: Optional[str] = ""
    level: Optional[str] = "A1"
    chat_id: Optional[str] = None
    use_search: bool = True
    voice: Optional[str] = None
    model: Optional[str] = None
    client_time: Optional[str] = None

class CreateChatRequest(BaseModel):
    title: Optional[str] = "Нова розмова"

class WordUpdateRequest(BaseModel):
    word: str
    status: int
    translation_uk: Optional[str] = ""
    synonyms: Optional[List[str]] = []
    notes: Optional[str] = ""
    sentence_context: Optional[str] = ""

class ProfileUpdateRequest(BaseModel):
    level: Optional[str] = None
    user_notes: Optional[str] = None

class DeleteMemoryRequest(BaseModel):
    id: Optional[int] = None
    note: Optional[str] = None

# ----------------- ENDPOINTS -----------------

@app.get("/api/health")
async def health_check():
    db_health = await db.get_health()
    stats = await db.get_stats()
    return {
        "status": "ok",
        "database": db_health,
        "vocabulary_stats": stats,
        "gemini_configured": bool(ai_service.api_key),
        "model": ai_service.preferred_model
    }

@app.get("/api/profile")
async def get_profile():
    return {"level": "A1 (Початківець)", "user_notes": ""}

@app.post("/api/profile")
async def update_profile(req: ProfileUpdateRequest):
    return req.model_dump(exclude_none=True)

@app.post("/api/profile/memory/delete")
async def delete_memory(req: DeleteMemoryRequest):
    return {"status": "ok"}

@app.get("/api/tts")
async def get_tts_audio(text: str = Query(..., min_length=1), voice: Optional[str] = None):
    try:
        audio_path = await tts_service.get_or_generate_audio(text, voice)
        return FileResponse(
            path=str(audio_path),
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=604800"}
        )
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate audio: {str(e)}")

@app.get("/api/translate")
async def translate_text(text: str = Query(..., min_length=1), context: Optional[str] = None):
    try:
        clean = text.strip()
        if " " not in clean and len(clean) <= 30:
            details = await translator_service.get_word_details(clean, context)
            saved = await db.get_word(clean)
            if saved:
                details["status"] = saved.get("status", 1)
                details["user_notes"] = saved.get("notes", "")
                saved_trans = fix_mojibake(saved.get("translation_uk") or "")
                # Only use saved translation if it's clean and valid Ukrainian
                if saved_trans and not is_bad_translation(saved_trans, clean):
                    details["translation_uk"] = saved_trans
            else:
                details["status"] = 0
            return details
        else:
            translated = translator_service.quick_translate(clean)
            return {
                "word": clean,
                "translation_uk": translated,
                "synonyms": [],
                "part_of_speech": "фраза",
                "explanation_uk": "",
                "status": 0
            }
    except Exception as e:
        logger.error(f"Translate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- CHATS (CLIENT-SIDE ONLY) -----------------

@app.get("/api/chats")
async def get_chats():
    return []

@app.post("/api/chats")
async def create_chat(req: CreateChatRequest):
    return {"chat_id": str(uuid.uuid4())[:8], "title": req.title or "Нова розмова"}

@app.get("/api/chats/{chat_id}/messages")
async def get_messages(chat_id: str):
    return []

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    return {"success": True, "chat_id": chat_id}

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest, background_tasks: BackgroundTasks):
    user_msg = req.message.strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    user_time = req.client_time or datetime.datetime.now().strftime("%H:%M")

    # Call AI directly with history and notes stored exclusively on client
    ai_resp = await ai_service.chat(
        user_message=user_msg,
        chat_history=req.history,
        use_search=req.use_search,
        requested_model=req.model,
        user_time=user_time,
        user_notes=req.user_notes,
        level=req.level
    )

    now_time = datetime.datetime.now().strftime("%H:%M")

    # Pre-generate TTS in background (whole reply + individual sentences for instant phrase selection)
    background_tasks.add_task(tts_service.get_or_generate_audio, ai_resp["danish_reply"], req.voice)
    try:
        reply_sentences = re.split(r'(?<=[.!?])\s+', ai_resp["danish_reply"].strip())
        for s in reply_sentences:
            s_clean = s.strip()
            if len(s_clean) > 3 and s_clean != ai_resp["danish_reply"].strip():
                background_tasks.add_task(tts_service.get_or_generate_audio, s_clean, req.voice)
    except Exception:
        pass

    if ai_resp["has_correction"] and ai_resp["natural_danish"]:
        background_tasks.add_task(tts_service.get_or_generate_audio, ai_resp["natural_danish"], req.voice)

    return {
        **ai_resp,
        "chat_id": req.chat_id,
        "time": now_time,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

# ----------------- VOCABULARY -----------------

@app.get("/api/words")
async def get_words(status: Optional[int] = None):
    return await db.get_all_words(status=status)

@app.get("/api/words/map")
async def get_words_map():
    return await db.get_words_map()

@app.post("/api/words")
async def save_word(req: WordUpdateRequest):
    return await db.upsert_word(
        word=req.word,
        status=req.status,
        translation_uk=fix_mojibake(req.translation_uk or ""),
        synonyms=req.synonyms or [],
        notes=req.notes or "",
        sentence_context=req.sentence_context or ""
    )

@app.delete("/api/words/{word}")
async def remove_word(word: str):
    success = await db.delete_word(word)
    return {"success": success, "word": word}

class BatchWordStatusUpdate(BaseModel):
    updates: List[Dict[str, Any]]

@app.post("/api/words/batch-status")
async def batch_update_words(req: BatchWordStatusUpdate):
    updates = [
        {"word_clean": str(item["word"]).strip().lower(), "status": int(item["status"])}
        for item in req.updates
        if "word" in item and "status" in item
    ]
    await db.batch_update_word_statuses(updates)
    return {"success": True, "count": len(updates)}

@app.get("/api/stats")
async def get_stats():
    return await db.get_stats()

# ----------------- FRONTEND SERVING -----------------

frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
