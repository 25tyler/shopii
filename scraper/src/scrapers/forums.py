import httpx
from typing import Optional
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from .base import BaseScraper, ScrapedReview


class HeadFiScraper(BaseScraper):
    """Scraper for Head-Fi.org audiophile forum."""

    source_type = "forum"
    base_url = "https://www.head-fi.org"

    async def search(self, query: str, limit: int = 10) -> list[ScrapedReview]:
        """Search Head-Fi for product discussions."""
        reviews = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                # Search Head-Fi
                search_url = f"{self.base_url}/search/?q={query.replace(' ', '+')}&t=post&o=relevance"
                await page.goto(search_url, wait_until="networkidle")

                # Get thread links from search results
                links = await page.query_selector_all("a.contentRow-title")

                urls_seen = set()
                for link in links[:limit]:
                    href = await link.get_attribute("href")
                    if href:
                        full_url = href if href.startswith("http") else f"{self.base_url}{href}"
                        urls_seen.add(full_url)

                await browser.close()

                # Scrape each thread
                for url in urls_seen:
                    review = await self.scrape_url(url)
                    if review:
                        reviews.append(review)
                        if len(reviews) >= limit:
                            break

        except Exception as e:
            print(f"Head-Fi search error: {e}")

        return reviews

    async def scrape_url(self, url: str) -> Optional[ScrapedReview]:
        """Scrape a specific Head-Fi thread URL."""
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                await page.goto(url, wait_until="networkidle")

                # Get thread title
                title_el = await page.query_selector("h1.p-title-value")
                title = await title_el.inner_text() if title_el else ""

                content_parts = [f"Thread: {title}"]

                # Get posts
                posts = await page.query_selector_all(".message-body .bbWrapper")
                total_likes = 0

                for i, post in enumerate(posts[:10]):
                    text = await post.inner_text()
                    if len(text) > 50:
                        content_parts.append(f"Post {i+1}: {text[:800]}")

                    # Try to get likes/reactions
                    try:
                        likes_el = await post.query_selector("[class*='reaction']")
                        if likes_el:
                            likes_text = await likes_el.inner_text()
                            likes = int("".join(filter(str.isdigit, likes_text)) or 0)
                            total_likes += likes
                    except Exception:
                        pass

                await browser.close()

                if len(content_parts) < 2:
                    return None

                return ScrapedReview(
                    source_type=self.source_type,
                    source_url=url,
                    source_name="Head-Fi",
                    content=self.normalize_content("\n\n".join(content_parts)),
                    upvotes=total_likes if total_likes > 0 else None,
                )

        except Exception as e:
            print(f"Head-Fi URL scrape error: {e}")
            return None


class AVSForumScraper(BaseScraper):
    """Scraper for AVSForum.com home theater discussions."""

    source_type = "forum"
    base_url = "https://www.avsforum.com"

    async def search(self, query: str, limit: int = 10) -> list[ScrapedReview]:
        """Search AVSForum for product discussions."""
        reviews = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                # Search AVSForum
                search_url = f"{self.base_url}/search/?q={query.replace(' ', '+')}&t=post&o=relevance"
                await page.goto(search_url, wait_until="networkidle")

                # Get thread links
                links = await page.query_selector_all("a.contentRow-title")

                urls_seen = set()
                for link in links[:limit]:
                    href = await link.get_attribute("href")
                    if href:
                        full_url = href if href.startswith("http") else f"{self.base_url}{href}"
                        urls_seen.add(full_url)

                await browser.close()

                for url in urls_seen:
                    review = await self.scrape_url(url)
                    if review:
                        reviews.append(review)
                        if len(reviews) >= limit:
                            break

        except Exception as e:
            print(f"AVSForum search error: {e}")

        return reviews

    async def scrape_url(self, url: str) -> Optional[ScrapedReview]:
        """Scrape a specific AVSForum thread URL."""
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                await page.goto(url, wait_until="networkidle")

                # Get thread title
                title_el = await page.query_selector("h1.p-title-value")
                title = await title_el.inner_text() if title_el else ""

                content_parts = [f"Thread: {title}"]

                # Get posts
                posts = await page.query_selector_all(".message-body .bbWrapper")

                for i, post in enumerate(posts[:10]):
                    text = await post.inner_text()
                    if len(text) > 50:
                        content_parts.append(f"Post {i+1}: {text[:800]}")

                await browser.close()

                if len(content_parts) < 2:
                    return None

                return ScrapedReview(
                    source_type=self.source_type,
                    source_url=url,
                    source_name="AVSForum",
                    content=self.normalize_content("\n\n".join(content_parts)),
                )

        except Exception as e:
            print(f"AVSForum URL scrape error: {e}")
            return None


# Create singleton instances
headfi_scraper = HeadFiScraper()
avsforum_scraper = AVSForumScraper()
