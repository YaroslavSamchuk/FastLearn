import asyncio
import logging
import re
import urllib.parse
from typing import Dict, Any, List, Optional
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("fastlearn.search")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7",
}

CASUAL_PHRASES = {
    "hej", "hej hej", "dav", "hejsa", "hallo", "godmorgen", "goddag",
    "godaften", "godnat", "farvel", "vi ses", "ses",
    "tak", "mange tak", "tusind tak", "selv tak", "velbekomme",
    "ja", "nej", "jo", "ok", "okay", "super", "fint", "godt", "det er fint",
    "hvordan går det", "hvordan har du det", "hvad laver du", "hvad sker der",
    "hvem er du", "hvad hedder du", "kan du hjælpe mig",
    "hi", "hello", "привіт", "дякую", "бувай"
}

class SearchService:
    def __init__(self):
        self.search_url = "https://html.duckduckgo.com/html/"

    def _extract_clean_text(self, html: str, max_chars: int = 1200) -> str:
        """Extract clean text content from HTML, removing ads, navigation, and boilerplate."""
        try:
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "noscript", "svg", "iframe"]):
                tag.decompose()

            # Find main article element if possible
            main_el = soup.find("article") or soup.find("main") or soup.find(id=re.compile(r"content|main|article", re.I)) or soup.body
            if not main_el:
                return ""

            paragraphs = []
            skip_phrases = ["cookie", "samtykke", "politik", "abonnement", "log ind", "privatliv", "nyhedsbrev"]

            for el in main_el.find_all(["p", "h1", "h2", "h3", "li"]):
                txt = el.get_text(strip=True)
                if len(txt) >= 20 and not any(phrase in txt.lower() for phrase in skip_phrases):
                    paragraphs.append(txt)
                    if sum(len(p) for p in paragraphs) >= max_chars:
                        break

            clean = " ".join(paragraphs).strip()
            return clean[:max_chars]
        except Exception as e:
            logger.debug(f"HTML parsing failed: {e}")
            return ""

    async def _fetch_page_clean(self, client: httpx.AsyncClient, url: str) -> str:
        """Fetch a single URL and return clean extracted text with strict timeout."""
        try:
            resp = await client.get(url, headers=HEADERS, follow_redirects=True, timeout=3.5)
            if resp.status_code == 200:
                return self._extract_clean_text(resp.text)
        except Exception as e:
            logger.debug(f"Failed to fetch {url}: {e}")
        return ""

    async def search_duckduckgo(self, query: str, max_results: int = 6) -> List[Dict[str, str]]:
        """Search DuckDuckGo HTML and extract search result items."""
        clean_query = query.strip()
        if not clean_query:
            return []

        try:
            async with httpx.AsyncClient(timeout=4.5) as client:
                resp = await client.post(
                    self.search_url,
                    data={"q": clean_query},
                    headers=HEADERS,
                    follow_redirects=True
                )
                if resp.status_code != 200:
                    logger.warning(f"DuckDuckGo returned status {resp.status_code}")
                    return []

                soup = BeautifulSoup(resp.text, "html.parser")
                results: List[Dict[str, str]] = []

                for r in soup.select(".result"):
                    title_el = r.select_one(".result__title a")
                    snippet_el = r.select_one(".result__snippet")
                    if title_el and snippet_el:
                        raw_url = title_el.get("href", "")
                        # Unwrap DuckDuckGo redirect
                        if "uddg=" in raw_url:
                            parsed = urllib.parse.parse_qs(urllib.parse.urlparse(raw_url).query)
                            clean_url = parsed.get("uddg", [raw_url])[0]
                        else:
                            clean_url = raw_url

                        # Skip ad links or empty URLs
                        if not clean_url.startswith("http") or "duckduckgo.com/y.js" in clean_url:
                            continue

                        results.append({
                            "title": title_el.get_text(strip=True),
                            "url": clean_url,
                            "snippet": snippet_el.get_text(strip=True)
                        })

                        if len(results) >= max_results:
                            break

                return results
        except Exception as e:
            logger.error(f"Error querying DuckDuckGo: {e}")
            return []

    def is_worth_searching(self, query: str) -> bool:
        """Determines if a query warrants web search or is just a greeting/casual conversational phrase."""
        q = re.sub(r"[^\w\s]", "", query.lower()).strip()
        if len(q) < 4:
            return False
        if q in CASUAL_PHRASES:
            return False

        # If all words in the message belong to basic greetings/conversational pool, skip search
        words = set(q.split())
        greetings_pool = {
            "hej", "dav", "hejsa", "hallo", "godmorgen", "goddag", "godaften", "godnat",
            "farvel", "ses", "vi", "tak", "mange", "tusind", "selv", "velbekomme",
            "ja", "nej", "jo", "ok", "okay", "super", "fint", "godt", "det", "er",
            "hvordan", "går", "har", "du", "hvad", "laver", "sker", "der", "hvem",
            "jeg", "mig", "hedder", "kommer", "fra", "bor", "i", "hi", "hello"
        }
        if words.issubset(greetings_pool):
            return False

        return True

    async def search_and_extract(self, query: str) -> Dict[str, Any]:
        """
        Executes a web search and scrapes top 3 pages for clean text,
        while returning next 3 pages with snippets and links.
        """
        if not self.is_worth_searching(query):
            return {
                "context_text": "",
                "sources": [],
                "has_results": False
            }

        results = await self.search_duckduckgo(query, max_results=6)
        if not results:
            return {
                "context_text": "",
                "sources": [],
                "has_results": False
            }

        top3 = results[:3]
        next3 = results[3:6]

        # Concurrently fetch top 3 pages
        async with httpx.AsyncClient() as client:
            fetch_tasks = [self._fetch_page_clean(client, item["url"]) for item in top3]
            scraped_texts = await asyncio.gather(*fetch_tasks, return_exceptions=True)

        lines = [
            "АКТУАЛЬНА ІНФОРМАЦІЯ З ІНТЕРНЕТУ (DuckDuckGo Live Search):",
            "=== ДЕТАЛЬНИЙ ЗМІСТ ТОП-3 СТОРІНОК ==="
        ]

        sources = []

        for idx, (item, text_res) in enumerate(zip(top3, scraped_texts), 1):
            clean_text = text_res if isinstance(text_res, str) and len(text_res) >= 80 else item["snippet"]
            lines.append(f"[{idx}] {item['title']} ({item['url']}):")
            lines.append(f"{clean_text}\n")
            sources.append({"title": item["title"], "url": item["url"]})

        if next3:
            lines.append("=== ДОДАТКОВІ РЕЗУЛЬТАТИ ТА ПОСИЛАННЯ (4-6) ===")
            for idx, item in enumerate(next3, 4):
                lines.append(f"[{idx}] {item['title']} ({item['url']}): {item['snippet']}")
                sources.append({"title": item["title"], "url": item["url"]})

        lines.append("\nВикористовуй ці факти з інтернету для точної, сучасної та змістовної відповіді учневі!")

        return {
            "context_text": "\n".join(lines),
            "sources": sources,
            "has_results": True
        }

search_service = SearchService()
