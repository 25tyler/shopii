from typing import Optional
from datetime import datetime
from googleapiclient.discovery import build
from .base import BaseScraper, ScrapedReview
from ..config.settings import get_settings

settings = get_settings()


class YouTubeScraper(BaseScraper):
    """Scraper for YouTube video comments on product reviews."""

    source_type = "youtube"

    def __init__(self):
        self.youtube = None
        if settings.youtube_api_key:
            self.youtube = build("youtube", "v3", developerKey=settings.youtube_api_key)

    async def search(self, query: str, limit: int = 20) -> list[ScrapedReview]:
        """Search YouTube for review videos and extract comments."""
        if not self.youtube:
            return []

        reviews = []

        try:
            # Search for review videos
            search_query = f"{query} review"
            search_response = self.youtube.search().list(
                q=search_query,
                part="id,snippet",
                maxResults=min(limit, 10),  # Get top 10 videos
                type="video",
                order="relevance",
                relevanceLanguage="en",
            ).execute()

            for item in search_response.get("items", []):
                video_id = item["id"]["videoId"]
                video_title = item["snippet"]["title"]
                channel_title = item["snippet"]["channelTitle"]

                # Get comments for this video
                video_reviews = await self._get_video_comments(
                    video_id,
                    video_title,
                    channel_title,
                    limit=5,  # 5 top comments per video
                )
                reviews.extend(video_reviews)

                if len(reviews) >= limit:
                    break

        except Exception as e:
            print(f"YouTube search error: {e}")

        return reviews[:limit]

    async def _get_video_comments(
        self,
        video_id: str,
        video_title: str,
        channel_title: str,
        limit: int = 10,
    ) -> list[ScrapedReview]:
        """Get top comments from a YouTube video."""
        if not self.youtube:
            return []

        reviews = []

        try:
            # Get video statistics
            video_response = self.youtube.videos().list(
                part="statistics",
                id=video_id,
            ).execute()

            video_stats = video_response.get("items", [{}])[0].get("statistics", {})
            view_count = int(video_stats.get("viewCount", 0))
            like_count = int(video_stats.get("likeCount", 0))

            # Get top comments
            comments_response = self.youtube.commentThreads().list(
                part="snippet",
                videoId=video_id,
                maxResults=limit,
                order="relevance",
                textFormat="plainText",
            ).execute()

            # Build content from video info and comments
            content_parts = [
                f"Video: {video_title}",
                f"Channel: {channel_title}",
                f"Views: {view_count:,}",
                f"Likes: {like_count:,}",
                "",
                "Top Comments:",
            ]

            total_comment_likes = 0
            for item in comments_response.get("items", []):
                comment = item["snippet"]["topLevelComment"]["snippet"]
                comment_text = comment.get("textDisplay", "")
                like_count = comment.get("likeCount", 0)
                total_comment_likes += like_count

                content_parts.append(f"- ({like_count} likes) {comment_text[:500]}")

            if content_parts:
                review = ScrapedReview(
                    source_type=self.source_type,
                    source_url=f"https://www.youtube.com/watch?v={video_id}",
                    source_name=channel_title,
                    content=self.normalize_content("\n".join(content_parts)),
                    upvotes=total_comment_likes,
                    comment_count=int(video_stats.get("commentCount", 0)),
                )
                reviews.append(review)

        except Exception as e:
            # Comments might be disabled
            print(f"YouTube comments error for {video_id}: {e}")

        return reviews

    async def scrape_url(self, url: str) -> Optional[ScrapedReview]:
        """Scrape comments from a specific YouTube video URL."""
        if not self.youtube:
            return None

        try:
            # Extract video ID from URL
            video_id = None
            if "youtube.com/watch?v=" in url:
                video_id = url.split("v=")[1].split("&")[0]
            elif "youtu.be/" in url:
                video_id = url.split("youtu.be/")[1].split("?")[0]

            if not video_id:
                return None

            # Get video info
            video_response = self.youtube.videos().list(
                part="snippet,statistics",
                id=video_id,
            ).execute()

            if not video_response.get("items"):
                return None

            video = video_response["items"][0]
            video_title = video["snippet"]["title"]
            channel_title = video["snippet"]["channelTitle"]

            reviews = await self._get_video_comments(
                video_id, video_title, channel_title, limit=20
            )

            return reviews[0] if reviews else None

        except Exception as e:
            print(f"YouTube URL scrape error: {e}")
            return None


# Create singleton instance
youtube_scraper = YouTubeScraper()
