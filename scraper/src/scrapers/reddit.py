import praw
from typing import Optional
from datetime import datetime
from .base import BaseScraper, ScrapedReview
from ..config.settings import get_settings

settings = get_settings()

# Subreddits organized by category
CATEGORY_SUBREDDITS = {
    "electronics": [
        "BuyItForLife",
        "gadgets",
        "technology",
        "techsupport",
    ],
    "headphones": [
        "headphones",
        "HeadphoneAdvice",
        "audiophile",
        "budgetaudiophile",
    ],
    "keyboards": [
        "MechanicalKeyboards",
        "keyboards",
        "ErgoMechKeyboards",
    ],
    "gaming": [
        "pcgaming",
        "buildapc",
        "GamingLaptops",
        "pcmasterrace",
    ],
    "home": [
        "BuyItForLife",
        "HomeImprovement",
        "homeowners",
        "DIY",
    ],
    "fashion": [
        "malefashionadvice",
        "femalefashionadvice",
        "frugalmalefashion",
        "Sneakers",
    ],
    "fitness": [
        "homegym",
        "Fitness",
        "running",
        "cycling",
    ],
}

# General subreddits for product discussions
GENERAL_SUBREDDITS = [
    "BuyItForLife",
    "ProductTesting",
    "AskReddit",
    "AmazonTopRated",
]


class RedditScraper(BaseScraper):
    """Scraper for Reddit discussions about products."""

    source_type = "reddit"

    def __init__(self):
        self.reddit = None
        if settings.reddit_client_id and settings.reddit_client_secret:
            self.reddit = praw.Reddit(
                client_id=settings.reddit_client_id,
                client_secret=settings.reddit_client_secret,
                user_agent=settings.reddit_user_agent,
            )

    def _get_subreddits_for_query(self, query: str) -> list[str]:
        """Determine relevant subreddits based on query."""
        query_lower = query.lower()

        subreddits = set(GENERAL_SUBREDDITS)

        # Add category-specific subreddits based on keywords
        keyword_mapping = {
            "electronics": ["phone", "laptop", "computer", "tech", "electronic"],
            "headphones": ["headphone", "earphone", "earbud", "audio", "speaker"],
            "keyboards": ["keyboard", "keycap", "switch", "mechanical"],
            "gaming": ["gaming", "game", "pc", "console", "monitor"],
            "home": ["kitchen", "home", "appliance", "furniture"],
            "fashion": ["shoe", "clothing", "jacket", "boot", "sneaker"],
            "fitness": ["gym", "fitness", "workout", "exercise", "running"],
        }

        for category, keywords in keyword_mapping.items():
            if any(kw in query_lower for kw in keywords):
                subreddits.update(CATEGORY_SUBREDDITS.get(category, []))

        return list(subreddits)

    async def search(self, query: str, limit: int = 20) -> list[ScrapedReview]:
        """Search Reddit for discussions about a product."""
        if not self.reddit:
            return []

        reviews = []
        subreddits = self._get_subreddits_for_query(query)

        # Search across relevant subreddits
        try:
            # Search all of Reddit first
            search_results = self.reddit.subreddit("all").search(
                query,
                sort="relevance",
                time_filter="all",
                limit=limit,
            )

            for post in search_results:
                # Skip posts from irrelevant subreddits
                if post.subreddit.display_name not in subreddits and len(reviews) >= limit // 2:
                    continue

                content = self._extract_post_content(post)
                if not content:
                    continue

                review = ScrapedReview(
                    source_type=self.source_type,
                    source_url=f"https://reddit.com{post.permalink}",
                    source_name=f"r/{post.subreddit.display_name}",
                    content=self.normalize_content(content),
                    upvotes=post.score,
                    comment_count=post.num_comments,
                    author=post.author.name if post.author else None,
                    posted_at=datetime.fromtimestamp(post.created_utc),
                )
                reviews.append(review)

                if len(reviews) >= limit:
                    break

        except Exception as e:
            print(f"Reddit search error: {e}")

        return reviews

    def _extract_post_content(self, post) -> str:
        """Extract meaningful content from a Reddit post."""
        content_parts = []

        # Add post title
        content_parts.append(f"Title: {post.title}")

        # Add post body if it's a self post
        if post.is_self and post.selftext:
            content_parts.append(f"Post: {post.selftext[:2000]}")

        # Get top comments
        try:
            post.comments.replace_more(limit=0)
            top_comments = post.comments[:10]

            for comment in top_comments:
                if hasattr(comment, "body") and comment.body and comment.score > 1:
                    content_parts.append(f"Comment ({comment.score} upvotes): {comment.body[:500]}")
        except Exception:
            pass

        return "\n\n".join(content_parts)

    async def scrape_url(self, url: str) -> Optional[ScrapedReview]:
        """Scrape a specific Reddit post URL."""
        if not self.reddit:
            return None

        try:
            # Extract post ID from URL
            submission = self.reddit.submission(url=url)

            content = self._extract_post_content(submission)
            if not content:
                return None

            return ScrapedReview(
                source_type=self.source_type,
                source_url=url,
                source_name=f"r/{submission.subreddit.display_name}",
                content=self.normalize_content(content),
                upvotes=submission.score,
                comment_count=submission.num_comments,
                author=submission.author.name if submission.author else None,
                posted_at=datetime.fromtimestamp(submission.created_utc),
            )
        except Exception as e:
            print(f"Reddit URL scrape error: {e}")
            return None


# Create singleton instance
reddit_scraper = RedditScraper()
