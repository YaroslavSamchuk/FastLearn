import datetime
import json
import logging
import re
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types
from backend.config import GEMINI_API_KEY, GEMINI_MODEL
from backend.search_service import search_service

logger = logging.getLogger("fastlearn.ai")

BASE_SYSTEM_INSTRUCTION = """Ти — доброзичливий, живий і уважний співрозмовник-носій датської мови (Danish language tutor & conversational partner).

ТВОЇ ПРАВИЛА:
1. РОЗМОВЛЯЙ ЯК СПРАВЖНЯ ЛЮДИНА — КОРОТКО (1-3 речення датською). Ніяких довгих нудних лекцій чи штучних есе. Підтримуй легкий, цікавий, природний діалог (hyggelig samtale).
2. АНАЛІЗ ПОВІДОМЛЕННЯ КОРИСТУВАЧА:
   - Якщо користувач написав датською з граматичними помилками, неправильним порядком слів або неприродно (дослівно переклав):
     - Вкажи, що він напевно мав на увазі ("what_you_meant_uk" українською).
     - Запропонуй, як це сказати найбільш природно і по-датськи ("natural_danish").
     - Коротко поясни правило чи нюанс українською ("explanation_uk").
     - Встанови "has_correction": true.
   - Якщо користувач написав правильно або українською/англійською:
     - "has_correction": false.
3. ПРОДОВЖЕННЯ РОЗМОВИ:
   - Незалежно від того, були помилки чи ні, дай коротку людську відповідь датською мовою ("danish_reply"), що органічно продовжує бесіду або ставить дружнє зустрічне питання.
4. ЧАС ПОВІДОМЛЕНЬ КОРИСТУВАЧА:
   - Перед кожним повідомленням користувача вказується локальний час у форматі [HH:MM] (наприклад, [14:30] або [20:18]).
   - Враховуй цей час для природності діалогу (наприклад, вітайся відповідно часу доби: Godmorgen / Goddag / Godaften, або природно реагуй на нічний час чи великі паузи між репліками).
   - НЕ вставляй мітки часу [HH:MM] у своє поле "danish_reply" та НЕ аналізуй їх як помилку в датській мові.

ФОРМАТ ВІДПОВІДІ:
Повертай ВИКЛЮЧНО валідний JSON-об'єкт:
{
  "danish_reply": "Коротка природна відповідь датською (1-3 речення)",
  "has_correction": true | false,
  "what_you_meant_uk": "Що користувач напевно мав на увазі (українською)",
  "natural_danish": "Як це звучить природно датською",
  "explanation_uk": "Коротке зрозуміле пояснення українською мовою"
}
"""

class AIService:
    def __init__(self):
        self.api_key = GEMINI_API_KEY
        self.preferred_model = GEMINI_MODEL or "gemini-3.5-flash-lite"
        self._init_client()

    def _init_client(self):
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.error(f"Failed to initialize Google GenAI client: {e}")
                self.client = None
        else:
            self.client = None

    async def chat(
        self,
        user_message: str,
        chat_history: Optional[List[Dict[str, Any]]] = None,
        use_search: bool = True,
        requested_model: Optional[str] = None,
        user_time: Optional[str] = None,
        user_notes: Optional[str] = "",
        level: Optional[str] = "A1"
    ) -> Dict[str, Any]:
        if not self.client:
            return {
                "danish_reply": "Indtast venligst din Gemini API-nøgle for at fortsætte.",
                "has_correction": False,
                "what_you_meant_uk": "",
                "natural_danish": "",
                "explanation_uk": "Будь ласка, перевірте налаштування Gemini API ключа.",
                "model_used": "none",
                "search_used": False,
                "sources": []
            }

        level_str = level or "A1"
        user_notes_str = user_notes or ""

        system_instruction_with_profile = f"""{BASE_SYSTEM_INSTRUCTION}

ПРОФІЛЬ ТА СТАТИЧНІ НАЛАШТУВАННЯ УЧНЯ:
- Рівень датської мови: {level_str}
- Постійні вказівки та стиль учня (НЕ ЗМІНЮВАТИ, ЗАВЖДИ НЕУХИЛЬНО ДОТРИМУВАТИСЯ):
{user_notes_str or 'Не вказано'}

Завжди неухильно дотримуйся цих постійних вказівок і рівня {level_str} під час кожної своєї відповіді!"""

        # Perform web search if requested
        search_context = ""
        search_sources = []
        if use_search and len(user_message.strip()) >= 3:
            try:
                search_res = await search_service.search_and_extract(user_message)
                if search_res.get("has_results"):
                    search_context = f"\n\n{search_res['context_text']}\n"
                    search_sources = search_res.get("sources", [])
                    logger.info(f"DuckDuckGo found {len(search_sources)} search sources for query")
            except Exception as e:
                logger.warning(f"DuckDuckGo search error: {e}")

        history_prompts = []
        if chat_history:
            # Rolling window: pass the last 30 messages to maintain dialogue continuity without forgetting static settings
            for msg in chat_history[-30:]:
                role = msg.get("role", "user")
                text = msg.get("content", "")
                if not text:
                    continue
                if role == "user":
                    msg_time = msg.get("time")
                    if not msg_time and msg.get("created_at"):
                        try:
                            raw = msg["created_at"].replace("Z", "+00:00")
                            dt = datetime.datetime.fromisoformat(raw)
                            msg_time = dt.strftime("%H:%M")
                        except Exception:
                            msg_time = ""
                    time_prefix = f"[{msg_time}] " if msg_time else ""
                    if text.startswith("[") and "]" in text[:10]:
                        history_prompts.append(f"USER: {text}")
                    else:
                        history_prompts.append(f"USER: {time_prefix}{text}")
                else:
                    history_prompts.append(f"MODEL: {text}")

        # Current user message timestamp prefix
        if not user_time:
            user_time = datetime.datetime.now().strftime("%H:%M")

        if user_message.startswith("[") and "]" in user_message[:10]:
            formatted_user_msg = user_message
        else:
            formatted_user_msg = f"[{user_time}] {user_message}"

        prompt = f"""{system_instruction_with_profile}

ІСТОРІЯ ПОПЕРЕДНЬОГО ДІАЛОГУ:
{chr(10).join(history_prompts) if history_prompts else 'Початок розмови'}{search_context}

НОВЕ ПОВІДОМЛЕННЯ ВІД КОРИСТУВАЧА:
"{formatted_user_msg}"

JSON:"""

        if requested_model == "gemma-4-31b-it":
            # Google's API currently returns 500 INTERNAL on 31B public endpoint.
            # Gracefully route to the working Gemma 4 26B model to avoid 35s delay.
            first_model = "gemma-4-26b-a4b-it"
        else:
            first_model = requested_model or self.preferred_model

        models_to_try = [
            first_model,
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
            "gemini-3.8-flash",
            "gemma-4-26b-a4b-it",
        ]
        models_to_try = [m for m in dict.fromkeys(models_to_try) if m]

        last_error = None

        for current_model in models_to_try:
            try:
                config = types.GenerateContentConfig(
                    temperature=0.7,
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
                )

                resp = self.client.models.generate_content(
                    model=current_model,
                    contents=prompt,
                    config=config
                )

                text = resp.text.strip()
                clean_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
                data = json.loads(clean_json)

                return {
                    "danish_reply": data.get("danish_reply", "Hej!"),
                    "has_correction": bool(data.get("has_correction", False)),
                    "what_you_meant_uk": data.get("what_you_meant_uk", ""),
                    "natural_danish": data.get("natural_danish", ""),
                    "explanation_uk": data.get("explanation_uk", ""),
                    "model_used": current_model,
                    "search_used": bool(search_sources),
                    "sources": search_sources
                }
            except Exception as e:
                last_error = e
                logger.warning(f"Error calling {current_model}: {e}")

        return {
            "danish_reply": "Beklager, der opstod en fejl ved kontakt til AI-tjenesten.",
            "has_correction": False,
            "what_you_meant_uk": "",
            "natural_danish": "",
            "explanation_uk": f"Помилка: {str(last_error)}",
            "model_used": "failed",
            "search_used": False,
            "sources": []
        }

ai_service = AIService()
