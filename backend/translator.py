import logging
import asyncio
import json
import re
from typing import Dict, Any, List, Optional
import httpx
from deep_translator import MyMemoryTranslator
from google import genai
from backend.config import GEMINI_API_KEY

logger = logging.getLogger("fastlearn.translator")

# In-memory LRU cache for translations and synonyms
_TRANSLATION_CACHE: Dict[str, str] = {}
_SYNONYM_CACHE: Dict[str, List[str]] = {}

def fix_mojibake(text: str) -> str:
    """Repairs UTF-8 bytes mistakenly decoded as ISO-8859-1 or Latin-1."""
    if not text:
        return ""
    if any(c in text for c in ("Ð", "Ñ", "â", "Ã", "Â")):
        try:
            fixed = text.encode("latin-1").decode("utf-8")
            if fixed and not any(c in fixed for c in ("Ð", "Ñ")):
                return fixed.strip()
        except Exception:
            pass
    return text.strip()

def is_bad_translation(uk_text: str, original_word: str) -> bool:
    """Validates that translation is meaningful and in Ukrainian, not mojibake or raw Latin/English."""
    if not uk_text:
        return True
    clean = uk_text.strip()
    if clean.lower() == original_word.strip().lower():
        return True
    # Mojibake remnants
    if any(c in clean for c in ("Ð", "Ñ", "â", "Ã")):
        return True
    # If the text is purely Latin letters (e.g. 'advancedDialog'), it failed to translate to Ukrainian
    latin_count = len(re.findall(r"[a-zA-Z]", clean))
    cyrillic_count = len(re.findall(r"[а-яА-ЯіїєґІЇЄҐ]", clean))
    if latin_count > 0 and cyrillic_count == 0:
        return True
    return False

# Common Danish synonyms dictionary for instant 0ms lookup
COMMON_DANISH_SYNONYMS: Dict[str, List[str]] = {
    "glad": ["lykkelig", "munter", "fornøjet", "tilfreds"],
    "god": ["fin", "dejlig", "udmærket", "glimrende"],
    "dårlig": ["slem", "elendig", "ringe", "forkert"],
    "stor": ["vældig", "enorm", "mægtig", "betydelig"],
    "lille": ["små", "kort", "bitte", "ubetydelig"],
    "hyggelig": ["rar", "behagelig", "lun", "gemytlig"],
    "hurtig": ["snar", "kvik", "rask", "ilende"],
    "langsom": ["træg", "dvælende", "forsigtig"],
    "smuk": ["køn", "flot", "dejlig", "fager"],
    "svær": ["vanskelig", "kompliceret", "krævende"],
    "let": ["nem", "ukompliceret", "simpel"],
    "vigtig": ["betydningsfuld", "væsentlig", "central"],
    "mange": ["adskillige", "utallige", "flere"],
    "tale": ["snakke", "sige", "drøfte", "ytre"],
    "se": ["kigge", "skue", "betragte", "øjne"],
    "gå": ["vandre", "spadsere", "skride"],
    "spise": ["indtage", "fortære", "nyde"],
    "drikke": ["indtage", "bælle", "slubre"],
    "arbejde": ["virke", "knokle", "bestille"],
    "elske": ["holde af", "lide", "begære"],
    "forstå": ["begribe", "fatte", "indse"],
    "vide": ["kende", "erfare"],
    "hus": ["bolig", "hjem", "bygning"],
    "ven": ["kammerat", "bekendt", "makker"],
    "by": ["stad", "metropol", "landsby"],
    "bil": ["køretøj", "automobil", "vogn"],
    "mad": ["føde", "kost", "måltid"],
    "vejr": ["klima", "vejrlig"],
    "tid": ["stund", "øjeblik", "periode"],
    "dag": ["døgn", "hverdag"],
    "penge": ["kontanter", "mønter", "valuta"],
    "rejse": ["tur", "udflugt", "fart"],
    "spørgsmål": ["forespørgsel", "problem", "tvivl"],
    "svar": ["replik", "forklaring", "løsning"],
}

class FastTranslatorService:
    def __init__(self):
        self._fallback_translator = MyMemoryTranslator(source="da-DK", target="uk-UA")
        self._ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

    def quick_translate(self, text: str) -> str:
        clean = text.strip()
        if not clean:
            return ""

        lower = clean.lower()
        if lower in _TRANSLATION_CACHE and not is_bad_translation(_TRANSLATION_CACHE[lower], lower):
            return _TRANSLATION_CACHE[lower]

        # 1. Try Gemini first if short text
        if self._ai_client and len(clean) <= 60:
            try:
                res = self._ai_client.models.generate_content(
                    model="gemini-3.5-flash-lite",
                    contents=f'Переклади з датської на українську: "{clean}". Напиши ТІЛЬКИ переклад українською мовою без латинських літер.',
                )
                t = fix_mojibake(res.text.strip().strip('"').strip("'"))
                if t and not is_bad_translation(t, clean):
                    _TRANSLATION_CACHE[lower] = t
                    return t
            except Exception as e:
                logger.debug(f"Gemini quick translate error: {e}")

        # 2. Fallback to MyMemory with encoding repair
        try:
            raw = self._fallback_translator.translate(clean)
            fixed = fix_mojibake(raw)
            if fixed and not is_bad_translation(fixed, clean):
                _TRANSLATION_CACHE[lower] = fixed
                return fixed
        except Exception as e:
            logger.warning(f"Translation fallback error: {e}")

        return clean

    async def get_synonyms(self, word_clean: str) -> List[str]:
        if word_clean in COMMON_DANISH_SYNONYMS:
            return COMMON_DANISH_SYNONYMS[word_clean]

        if word_clean in _SYNONYM_CACHE:
            return _SYNONYM_CACHE[word_clean]

        # Fast non-blocking lookup from Wiktionary
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                headers = {"User-Agent": "FastLearnBot/1.0 (https://github.com/fastlearn; fastlearn@gmail.com) python-httpx"}
                url = f"https://da.wiktionary.org/w/api.php?action=query&format=json&titles={word_clean}&prop=extracts&explaintext=1"
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    text = resp.text
                    if "Synonymer" in text:
                        part = text.split("Synonymer")[1][:120]
                        syns = [s.strip(" *-\n") for s in part.split("\n") if s.strip(" *-\n") and len(s) < 25]
                        if syns:
                            _SYNONYM_CACHE[word_clean] = syns[:4]
                            return syns[:4]
        except Exception as e:
            logger.debug(f"Synonym lookup error: {e}")

        return []

    async def get_word_details(self, word: str, context_sentence: Optional[str] = None) -> Dict[str, Any]:
        """
        Translates Danish word to clean Ukrainian with Danish synonyms.
        Uses Gemini 3.5 Flash-Lite for high-quality context-aware translation,
        with automated mojibake repair and robust fallback.
        """
        clean = word.strip().lower()
        if not clean:
            return {
                "word": word.strip(),
                "word_clean": clean,
                "translation_uk": "",
                "synonyms": [],
                "part_of_speech": "",
                "explanation_uk": ""
            }

        # 1. Check in-memory cache
        if clean in _TRANSLATION_CACHE and not is_bad_translation(_TRANSLATION_CACHE[clean], clean):
            return {
                "word": word.strip(),
                "word_clean": clean,
                "translation_uk": _TRANSLATION_CACHE[clean],
                "synonyms": _SYNONYM_CACHE.get(clean, COMMON_DANISH_SYNONYMS.get(clean, [])),
                "part_of_speech": "",
                "explanation_uk": ""
            }

        # 2. High-quality Gemini translation (takes ~0.4-0.7s)
        if self._ai_client:
            try:
                loop = asyncio.get_event_loop()
                def call_gemini():
                    ctx = f' Контекст речення: "{context_sentence}".' if context_sentence else ""
                    prompt = (
                        f'Ти професійний датсько-український перекладач. Переклади данське слово "{clean}".{ctx}\n'
                        'Поверни виключно JSON формату:\n'
                        '{\n'
                        '  "translation_uk": "найточніший переклад українською мовою (1-2 слова)",\n'
                        '  "synonyms": ["данський_синонім_1", "данський_синонім_2"],\n'
                        '  "part_of_speech": "частина мови українською"\n'
                        '}\n'
                        'Відповідай ТІЛЬКИ валідним JSON.'
                    )
                    return self._ai_client.models.generate_content(
                        model="gemini-3.5-flash-lite",
                        contents=prompt,
                    )

                res = await asyncio.wait_for(loop.run_in_executor(None, call_gemini), timeout=3.5)
                text = res.text.strip()
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()

                data = json.loads(text)
                trans_uk = fix_mojibake(str(data.get("translation_uk", "")).strip())
                syns = [str(s).strip() for s in data.get("synonyms", []) if isinstance(s, str) and s.strip()]
                pos = str(data.get("part_of_speech", "")).strip()

                if trans_uk and not is_bad_translation(trans_uk, clean):
                    _TRANSLATION_CACHE[clean] = trans_uk
                    if syns:
                        _SYNONYM_CACHE[clean] = syns
                    return {
                        "word": word.strip(),
                        "word_clean": clean,
                        "translation_uk": trans_uk,
                        "synonyms": syns or COMMON_DANISH_SYNONYMS.get(clean, []),
                        "part_of_speech": pos,
                        "explanation_uk": ""
                    }
            except Exception as e:
                logger.warning(f"Gemini translation for '{clean}' error: {e}")

        # 3. Fallback: MyMemory with mojibake repair + Wiktionary synonyms
        loop = asyncio.get_event_loop()
        trans_task = loop.run_in_executor(None, self.quick_translate, clean)
        syns_task = self.get_synonyms(clean)
        translation_uk, synonyms = await asyncio.gather(trans_task, syns_task)

        return {
            "word": word.strip(),
            "word_clean": clean,
            "translation_uk": fix_mojibake(translation_uk),
            "synonyms": synonyms,
            "part_of_speech": "",
            "explanation_uk": ""
        }

translator_service = FastTranslatorService()
