from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from datetime import datetime


@dataclass
class ScrapedReview:
    """Represents a single scraped review/discussion."""

    source_type: str  # reddit, youtube, wirecutter, etc.
    source_url: str
    source_name: str  # subreddit name, channel name, site name
    content: str
    upvotes: Optional[int] = None
    comment_count: Optional[int] = None
    author: Optional[str] = None
    posted_at: Optional[datetime] = None


@dataclass
class ScrapedProduct:
    """Represents scraped product information."""

    name: str
    retailer: str
    external_id: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    current_price: Optional[float] = None
    currency: str = "USD"
    affiliate_url: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None


class BaseScraper(ABC):
    """Base class for all scrapers."""

    source_type: str = "unknown"

    @abstractmethod
    async def search(self, query: str, limit: int = 20) -> list[ScrapedReview]:
        """Search for reviews/discussions about a product."""
        pass

    @abstractmethod
    async def scrape_url(self, url: str) -> Optional[ScrapedReview]:
        """Scrape a specific URL for review content."""
        pass

    def normalize_content(self, content: str) -> str:
        """Clean and normalize scraped content."""
        if not content:
            return ""

        # Remove excessive whitespace
        content = " ".join(content.split())

        # Truncate if too long (keep first 5000 chars)
        if len(content) > 5000:
            content = content[:5000] + "..."

        return content
