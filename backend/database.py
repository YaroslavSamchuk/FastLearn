import certifi
import datetime
import logging
from typing import List, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError
from backend.config import MONGO_URI, MONGO_DB_NAME

logger = logging.getLogger("fastlearn.database")

class DatabaseManager:
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db = None
        self.is_connected = False
        self.connection_error: Optional[str] = None
        # Fast memory buffer for words in case of connection interruptions
        self.memory_words: Dict[str, Dict[str, Any]] = {}

    async def connect(self):
        try:
            logger.info(f"Connecting to MongoDB at: {MONGO_URI.split('@')[-1] if '@' in MONGO_URI else MONGO_URI}")
            self.client = AsyncIOMotorClient(
                MONGO_URI,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=4000,
                connectTimeoutMS=4000,
                socketTimeoutMS=5000,
            )
            await self.client.admin.command("ping")
            self.db = self.client[MONGO_DB_NAME]
            self.is_connected = True
            self.connection_error = None
            logger.info("Successfully connected to MongoDB!")

            try:
                await self.db.words.create_index("word_clean", unique=True)
                await self.db.words.create_index("status")
            except Exception as e:
                logger.warning(f"Could not build indexes on words: {e}")

        except Exception as e:
            self.is_connected = False
            self.connection_error = str(e)
            logger.warning(f"MongoDB connection failed: {e}. Vocabulary will use memory buffer.")

    async def get_health(self) -> Dict[str, Any]:
        return {
            "connected": self.is_connected,
            "error": self.connection_error,
            "backend": "mongodb" if self.is_connected else "disconnected",
        }

    # ------------------ WORDS / VOCABULARY (MONGODB) ------------------

    async def get_word(self, word: str) -> Optional[Dict[str, Any]]:
        clean = word.strip().lower()
        if self.is_connected and self.db is not None:
            try:
                doc = await self.db.words.find_one({"word_clean": clean})
                if doc:
                    doc["_id"] = str(doc["_id"])
                    return doc
            except PyMongoError as e:
                logger.error(f"Error fetching word from mongo: {e}")
        return self.memory_words.get(clean)

    async def get_all_words(self, status: Optional[int] = None) -> List[Dict[str, Any]]:
        if self.is_connected and self.db is not None:
            try:
                query = {} if status is None else {"status": status}
                cursor = self.db.words.find(query).sort("updated_at", -1)
                results = []
                async for doc in cursor:
                    doc["_id"] = str(doc["_id"])
                    results.append(doc)
                return results
            except PyMongoError as e:
                logger.error(f"Error fetching words list from mongo: {e}")

        words = list(self.memory_words.values())
        if status is not None:
            words = [w for w in words if w.get("status") == status]
        return sorted(words, key=lambda x: x.get("updated_at", ""), reverse=True)

    async def upsert_word(
        self,
        word: str,
        status: int = 1,
        translation_uk: str = "",
        synonyms: Optional[List[str]] = None,
        notes: str = "",
        sentence_context: str = ""
    ) -> Dict[str, Any]:
        clean = word.strip().lower()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        synonyms = synonyms or []

        data = {
            "word": word.strip(),
            "word_clean": clean,
            "status": status,
            "translation_uk": translation_uk,
            "synonyms": synonyms,
            "notes": notes,
            "sentence_context": sentence_context,
            "updated_at": now
        }

        self.memory_words[clean] = dict(data)

        if self.is_connected and self.db is not None:
            try:
                mongo_set = dict(data)
                mongo_set.pop("created_at", None)
                await self.db.words.update_one(
                    {"word_clean": clean},
                    {
                        "$set": mongo_set,
                        "$setOnInsert": {"created_at": now}
                    },
                    upsert=True
                )
            except PyMongoError as e:
                logger.error(f"Error updating word in mongo: {e}")

        return data

    async def delete_word(self, word: str) -> bool:
        clean = word.strip().lower()
        if clean in self.memory_words:
            del self.memory_words[clean]

        if self.is_connected and self.db is not None:
            try:
                res = await self.db.words.delete_one({"word_clean": clean})
                return res.deleted_count > 0
            except PyMongoError as e:
                logger.error(f"Error deleting word in mongo: {e}")
        return True

    async def get_words_map(self) -> Dict[str, Dict[str, Any]]:
        words_list = await self.get_all_words()
        return {
            w["word_clean"]: {
                "status": w.get("status", 1),
                "translation_uk": w.get("translation_uk", ""),
                "synonyms": w.get("synonyms", [])
            }
            for w in words_list
        }

    async def get_stats(self) -> Dict[str, int]:
        words = await self.get_all_words()
        return {
            "total": len(words),
            "learning": sum(1 for w in words if 1 <= w.get("status", 1) <= 10),
            "known": sum(1 for w in words if w.get("status", 1) >= 11),
        }

    async def batch_update_word_statuses(self, updates: List[Dict[str, Any]]) -> bool:
        if not updates:
            return True
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for item in updates:
            clean = item["word_clean"].strip().lower()
            new_status = int(item["status"])
            if clean in self.memory_words:
                self.memory_words[clean]["status"] = new_status
                self.memory_words[clean]["updated_at"] = now
            if self.is_connected and self.db is not None:
                try:
                    await self.db.words.update_one(
                        {"word_clean": clean},
                        {"$set": {"status": new_status, "updated_at": now}}
                    )
                except PyMongoError as e:
                    logger.error(f"Error updating word {clean} in mongo: {e}")
        return True

db = DatabaseManager()
