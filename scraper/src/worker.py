"""Celery worker for scraping tasks."""
from celery import Celery
from .config.settings import get_settings
from .config.database import get_db
from .scrapers.reddit import reddit_scraper
from .scrapers.youtube import youtube_scraper
from .scrapers.review_sites import wirecutter_scraper, rtings_scraper, techradar_scraper
from .scrapers.forums import headfi_scraper, avsforum_scraper
from .processors.rating_calculator import rating_calculator
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import text

settings = get_settings()

# Initialize Celery
celery_app = Celery(
    "shopii_scraper",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes max
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)


def run_async(coro):
    """Helper to run async functions in sync context."""
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)


@celery_app.task(bind=True, max_retries=3)
def scrape_product_reviews(self, product_id: str, product_name: str, category: str = None):
    """
    Scrape reviews for a product from all sources.

    Args:
        product_id: UUID of the product in database
        product_name: Name of the product to search for
        category: Optional category to help target relevant sources
    """
    try:
        print(f"Starting scrape for product: {product_name} ({product_id})")

        all_reviews = []

        # Scrape from each source
        scrapers = [
            ("reddit", reddit_scraper),
            ("youtube", youtube_scraper),
            ("wirecutter", wirecutter_scraper),
            ("rtings", rtings_scraper),
            ("techradar", techradar_scraper),
        ]

        # Add forum scrapers based on category
        if category in ["headphones", "audio", "electronics"]:
            scrapers.append(("headfi", headfi_scraper))
        if category in ["home_theater", "tv", "audio"]:
            scrapers.append(("avsforum", avsforum_scraper))

        for name, scraper in scrapers:
            try:
                print(f"  Scraping {name}...")
                reviews = run_async(scraper.search(product_name, limit=10))
                all_reviews.extend(reviews)
                print(f"  Found {len(reviews)} reviews from {name}")
            except Exception as e:
                print(f"  Error scraping {name}: {e}")

        print(f"Total reviews collected: {len(all_reviews)}")

        if not all_reviews:
            print("No reviews found, skipping rating calculation")
            return {"status": "no_reviews", "product_id": product_id}

        # Save reviews to database
        with get_db() as db:
            for review in all_reviews:
                # Check if already exists
                existing = db.execute(
                    text("SELECT id FROM review_sources WHERE source_url = :url"),
                    {"url": review.source_url}
                ).fetchone()

                if existing:
                    continue

                db.execute(
                    text("""
                        INSERT INTO review_sources
                        (product_id, source_type, source_url, source_name, raw_content, upvotes, comment_count, scraped_at)
                        VALUES (:product_id, :source_type, :source_url, :source_name, :raw_content, :upvotes, :comment_count, NOW())
                    """),
                    {
                        "product_id": product_id,
                        "source_type": review.source_type,
                        "source_url": review.source_url,
                        "source_name": review.source_name,
                        "raw_content": review.content,
                        "upvotes": review.upvotes,
                        "comment_count": review.comment_count,
                    }
                )

        # Calculate rating
        print("Calculating AI rating...")
        rating = run_async(rating_calculator.calculate_rating(product_name, all_reviews))

        # Save rating to database
        with get_db() as db:
            db.execute(
                text("""
                    INSERT INTO product_ratings
                    (product_id, ai_rating, confidence, sentiment_score, reliability_score,
                     value_score, popularity_score, sources_analyzed, pros, cons, summary, calculated_at)
                    VALUES (:product_id, :ai_rating, :confidence, :sentiment_score, :reliability_score,
                            :value_score, :popularity_score, :sources_analyzed, :pros, :cons, :summary, NOW())
                    ON CONFLICT (product_id)
                    DO UPDATE SET
                        ai_rating = EXCLUDED.ai_rating,
                        confidence = EXCLUDED.confidence,
                        sentiment_score = EXCLUDED.sentiment_score,
                        reliability_score = EXCLUDED.reliability_score,
                        value_score = EXCLUDED.value_score,
                        popularity_score = EXCLUDED.popularity_score,
                        sources_analyzed = EXCLUDED.sources_analyzed,
                        pros = EXCLUDED.pros,
                        cons = EXCLUDED.cons,
                        summary = EXCLUDED.summary,
                        calculated_at = NOW()
                """),
                {
                    "product_id": product_id,
                    "ai_rating": rating.ai_rating,
                    "confidence": rating.confidence,
                    "sentiment_score": rating.sentiment_score,
                    "reliability_score": rating.reliability_score,
                    "value_score": rating.value_score,
                    "popularity_score": rating.popularity_score,
                    "sources_analyzed": rating.sources_analyzed,
                    "pros": rating.pros,
                    "cons": rating.cons,
                    "summary": rating.summary,
                }
            )

            # Update product last_scraped_at
            db.execute(
                text("UPDATE products SET last_scraped_at = NOW() WHERE id = :product_id"),
                {"product_id": product_id}
            )

        print(f"Rating calculated: {rating.ai_rating}/100 (confidence: {rating.confidence})")

        return {
            "status": "success",
            "product_id": product_id,
            "ai_rating": rating.ai_rating,
            "confidence": rating.confidence,
            "sources_analyzed": rating.sources_analyzed,
        }

    except Exception as e:
        print(f"Task error: {e}")
        raise self.retry(exc=e, countdown=60)


@celery_app.task
def refresh_stale_ratings(days_threshold: int = 7):
    """
    Find products with stale ratings and queue them for refresh.

    Args:
        days_threshold: Number of days after which a rating is considered stale
    """
    threshold_date = datetime.utcnow() - timedelta(days=days_threshold)

    with get_db() as db:
        # Find products that need refresh
        stale_products = db.execute(
            text("""
                SELECT p.id, p.name, p.category
                FROM products p
                LEFT JOIN product_ratings pr ON p.id = pr.product_id
                WHERE pr.calculated_at IS NULL
                   OR pr.calculated_at < :threshold
                ORDER BY p.created_at DESC
                LIMIT 100
            """),
            {"threshold": threshold_date}
        ).fetchall()

        print(f"Found {len(stale_products)} products needing rating refresh")

        for product in stale_products:
            scrape_product_reviews.delay(
                product_id=str(product.id),
                product_name=product.name,
                category=product.category,
            )


@celery_app.task
def scrape_url(url: str, product_id: str = None):
    """
    Scrape a specific URL and optionally associate with a product.

    Args:
        url: URL to scrape
        product_id: Optional product ID to associate the review with
    """
    review = None

    # Determine scraper based on URL
    if "reddit.com" in url:
        review = run_async(reddit_scraper.scrape_url(url))
    elif "youtube.com" in url or "youtu.be" in url:
        review = run_async(youtube_scraper.scrape_url(url))
    elif "nytimes.com/wirecutter" in url:
        review = run_async(wirecutter_scraper.scrape_url(url))
    elif "rtings.com" in url:
        review = run_async(rtings_scraper.scrape_url(url))
    elif "techradar.com" in url:
        review = run_async(techradar_scraper.scrape_url(url))
    elif "head-fi.org" in url:
        review = run_async(headfi_scraper.scrape_url(url))
    elif "avsforum.com" in url:
        review = run_async(avsforum_scraper.scrape_url(url))

    if not review:
        return {"status": "failed", "url": url}

    # Save to database if product_id provided
    if product_id:
        with get_db() as db:
            db.execute(
                text("""
                    INSERT INTO review_sources
                    (product_id, source_type, source_url, source_name, raw_content, upvotes, comment_count, scraped_at)
                    VALUES (:product_id, :source_type, :source_url, :source_name, :raw_content, :upvotes, :comment_count, NOW())
                    ON CONFLICT (source_url) DO NOTHING
                """),
                {
                    "product_id": product_id,
                    "source_type": review.source_type,
                    "source_url": review.source_url,
                    "source_name": review.source_name,
                    "raw_content": review.content,
                    "upvotes": review.upvotes,
                    "comment_count": review.comment_count,
                }
            )

    return {
        "status": "success",
        "url": url,
        "source_type": review.source_type,
        "content_length": len(review.content),
    }


# Celery Beat schedule for periodic tasks
celery_app.conf.beat_schedule = {
    "refresh-stale-ratings-daily": {
        "task": "src.worker.refresh_stale_ratings",
        "schedule": 86400.0,  # Every 24 hours
        "args": (7,),  # 7 day threshold
    },
}
