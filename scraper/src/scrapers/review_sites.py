import httpx
from typing import Optional
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from .base import BaseScraper, ScrapedReview
from ..config.settings import get_settings

settings = get_settings()


class WirecutterScraper(BaseScraper):
    """Scraper for Wirecutter (NYT) product reviews."""

    source_type = "wirecutter"
    base_url = "https://www.nytimes.com/wirecutter"

    async def search(self, query: str, limit: int = 5) -> list[ScrapedReview]:
        """Search Wirecutter for product reviews."""
        reviews = []

        try:
            async with httpx.AsyncClient() as client:
                # Search Wirecutter
                search_url = f"{self.base_url}/search/?s={query.replace(' ', '+')}"
                response = await client.get(
                    search_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Shopii/1.0)"},
                    follow_redirects=True,
                )

                if response.status_code != 200:
                    return reviews

                soup = BeautifulSoup(response.text, "lxml")

                # Find article links
                articles = soup.select("article a[href*='/reviews/']")[:limit]

                for article in articles:
                    url = article.get("href", "")
                    if not url.startswith("http"):
                        url = f"https://www.nytimes.com{url}"

                    review = await self.scrape_url(url)
                    if review:
                        reviews.append(review)

        except Exception as e:
            print(f"Wirecutter search error: {e}")

        return reviews

    async def scrape_url(self, url: str) -> Optional[ScrapedReview]:
        """Scrape a specific Wirecutter review URL."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Shopii/1.0)"},
                    follow_redirects=True,
                )

                if response.status_code != 200:
                    return None

                soup = BeautifulSoup(response.text, "lxml")

                # Extract title
                title = soup.select_one("h1")
                title_text = title.get_text(strip=True) if title else ""

                # Extract article content
                content_parts = [f"Article: {title_text}"]

                # Get main article paragraphs
                paragraphs = soup.select("article p")[:20]
                for p in paragraphs:
                    text = p.get_text(strip=True)
                    if len(text) > 50:  # Skip short paragraphs
                        content_parts.append(text)

                # Look for "Our pick" or recommendations
                picks = soup.select("[class*='pick'], [class*='recommendation']")
                for pick in picks[:5]:
                    text = pick.get_text(strip=True)
                    if text:
                        content_parts.append(f"Recommendation: {text}")

                if len(content_parts) < 2:
                    return None

                return ScrapedReview(
                    source_type=self.source_type,
                    source_url=url,
                    source_name="Wirecutter",
                    content=self.normalize_content("\n\n".join(content_parts)),
                )

        except Exception as e:
            print(f"Wirecutter URL scrape error: {e}")
            return None


class RTINGSScraper(BaseScraper):
    """Scraper for RTINGS.com product reviews."""

    source_type = "rtings"
    base_url = "https://www.rtings.com"

    async def search(self, query: str, limit: int = 5) -> list[ScrapedReview]:
        """Search RTINGS for product reviews."""
        reviews = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                # Go to RTINGS search
                search_url = f"{self.base_url}/search?query={query.replace(' ', '+')}"
                await page.goto(search_url, wait_until="networkidle")

                # Get review links
                links = await page.query_selector_all("a[href*='/reviews/']")

                urls_seen = set()
                for link in links[:limit * 2]:
                    href = await link.get_attribute("href")
                    if href and "/reviews/" in href:
                        full_url = href if href.startswith("http") else f"{self.base_url}{href}"
                        if full_url not in urls_seen:
                            urls_seen.add(full_url)

                await browser.close()

                # Scrape each review URL
                for url in list(urls_seen)[:limit]:
                    review = await self.scrape_url(url)
                    if review:
                        reviews.append(review)

        except Exception as e:
            print(f"RTINGS search error: {e}")

        return reviews

    async def scrape_url(self, url: str) -> Optional[ScrapedReview]:
        """Scrape a specific RTINGS review URL."""
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                await page.goto(url, wait_until="networkidle")

                # Extract title
                title_el = await page.query_selector("h1")
                title = await title_el.inner_text() if title_el else ""

                # Extract overall score
                score_el = await page.query_selector("[class*='score'], [class*='rating']")
                score = await score_el.inner_text() if score_el else ""

                content_parts = [f"Review: {title}"]
                if score:
                    content_parts.append(f"Score: {score}")

                # Get verdict/summary
                verdict_el = await page.query_selector("[class*='verdict'], [class*='summary']")
                if verdict_el:
                    verdict = await verdict_el.inner_text()
                    content_parts.append(f"Verdict: {verdict}")

                # Get pros and cons
                pros_el = await page.query_selector_all("[class*='pros'] li, [class*='positive'] li")
                cons_el = await page.query_selector_all("[class*='cons'] li, [class*='negative'] li")

                if pros_el:
                    pros = [await el.inner_text() for el in pros_el[:5]]
                    content_parts.append(f"Pros: {', '.join(pros)}")

                if cons_el:
                    cons = [await el.inner_text() for el in cons_el[:5]]
                    content_parts.append(f"Cons: {', '.join(cons)}")

                # Get main content paragraphs
                paragraphs = await page.query_selector_all("article p, .review-body p")
                for p in paragraphs[:10]:
                    text = await p.inner_text()
                    if len(text) > 100:
                        content_parts.append(text)

                await browser.close()

                if len(content_parts) < 2:
                    return None

                return ScrapedReview(
                    source_type=self.source_type,
                    source_url=url,
                    source_name="RTINGS",
                    content=self.normalize_content("\n\n".join(content_parts)),
                )

        except Exception as e:
            print(f"RTINGS URL scrape error: {e}")
            return None


class TechRadarScraper(BaseScraper):
    """Scraper for TechRadar product reviews."""

    source_type = "techradar"
    base_url = "https://www.techradar.com"

    async def search(self, query: str, limit: int = 5) -> list[ScrapedReview]:
        """Search TechRadar for product reviews."""
        reviews = []

        try:
            async with httpx.AsyncClient() as client:
                search_url = f"{self.base_url}/search?searchTerm={query.replace(' ', '+')}"
                response = await client.get(
                    search_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Shopii/1.0)"},
                    follow_redirects=True,
                )

                if response.status_code != 200:
                    return reviews

                soup = BeautifulSoup(response.text, "lxml")

                # Find review article links
                links = soup.select("a[href*='/reviews/']")[:limit * 2]

                urls_seen = set()
                for link in links:
                    href = link.get("href", "")
                    if href and "/reviews/" in href:
                        full_url = href if href.startswith("http") else f"{self.base_url}{href}"
                        if full_url not in urls_seen:
                            urls_seen.add(full_url)

                for url in list(urls_seen)[:limit]:
                    review = await self.scrape_url(url)
                    if review:
                        reviews.append(review)

        except Exception as e:
            print(f"TechRadar search error: {e}")

        return reviews

    async def scrape_url(self, url: str) -> Optional[ScrapedReview]:
        """Scrape a specific TechRadar review URL."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Shopii/1.0)"},
                    follow_redirects=True,
                )

                if response.status_code != 200:
                    return None

                soup = BeautifulSoup(response.text, "lxml")

                # Extract title
                title = soup.select_one("h1")
                title_text = title.get_text(strip=True) if title else ""

                content_parts = [f"Review: {title_text}"]

                # Extract rating
                rating = soup.select_one("[class*='rating'], [class*='score']")
                if rating:
                    content_parts.append(f"Rating: {rating.get_text(strip=True)}")

                # Extract verdict
                verdict = soup.select_one("[class*='verdict'], .article__summary")
                if verdict:
                    content_parts.append(f"Verdict: {verdict.get_text(strip=True)}")

                # Extract pros and cons
                for_against = soup.select("[class*='for-against'] li, [class*='pros-cons'] li")
                for item in for_against[:10]:
                    content_parts.append(item.get_text(strip=True))

                # Get main content
                paragraphs = soup.select("article p, .body-copy p")[:15]
                for p in paragraphs:
                    text = p.get_text(strip=True)
                    if len(text) > 100:
                        content_parts.append(text)

                if len(content_parts) < 2:
                    return None

                return ScrapedReview(
                    source_type=self.source_type,
                    source_url=url,
                    source_name="TechRadar",
                    content=self.normalize_content("\n\n".join(content_parts)),
                )

        except Exception as e:
            print(f"TechRadar URL scrape error: {e}")
            return None


# Create singleton instances
wirecutter_scraper = WirecutterScraper()
rtings_scraper = RTINGSScraper()
techradar_scraper = TechRadarScraper()
