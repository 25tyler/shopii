import anthropic
from dataclasses import dataclass
from typing import Optional
from ..scrapers.base import ScrapedReview
from ..config.settings import get_settings

settings = get_settings()


@dataclass
class ProductRating:
    """Calculated product rating from aggregated reviews."""

    ai_rating: int  # 0-100
    confidence: float  # 0.0-1.0
    sentiment_score: float  # -1.0 to 1.0
    reliability_score: float  # 0.0-1.0
    value_score: float  # 0.0-1.0
    popularity_score: float  # 0.0-1.0
    sources_analyzed: int
    pros: list[str]
    cons: list[str]
    summary: str


@dataclass
class ReviewAnalysis:
    """Analysis of a single review."""

    sentiment: float  # -1.0 to 1.0
    pros: list[str]
    cons: list[str]
    credibility_weight: float  # 0.0-1.0


# Credibility weights by source type
SOURCE_CREDIBILITY = {
    "wirecutter": 0.95,
    "rtings": 0.95,
    "techradar": 0.85,
    "youtube": 0.70,
    "reddit": 0.60,
    "forum": 0.55,
    "unknown": 0.50,
}


class RatingCalculator:
    """Calculates product ratings from aggregated reviews using AI."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    async def analyze_review(self, review: ScrapedReview) -> ReviewAnalysis:
        """Analyze a single review for sentiment and key points."""
        base_credibility = SOURCE_CREDIBILITY.get(review.source_type, 0.5)

        # Adjust credibility based on engagement
        engagement_bonus = 0
        if review.upvotes:
            if review.upvotes > 100:
                engagement_bonus = 0.1
            elif review.upvotes > 50:
                engagement_bonus = 0.05
            elif review.upvotes > 10:
                engagement_bonus = 0.02

        credibility = min(1.0, base_credibility + engagement_bonus)

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=500,
                messages=[
                    {
                        "role": "user",
                        "content": f"""Analyze this product review and extract:
1. Overall sentiment (-1.0 very negative to 1.0 very positive)
2. Top 3 pros mentioned (if any)
3. Top 3 cons mentioned (if any)

Review from {review.source_name}:
{review.content[:3000]}

Respond in JSON format only:
{{"sentiment": 0.5, "pros": ["pro1", "pro2"], "cons": ["con1"]}}""",
                    }
                ],
            )

            text = response.content[0].text
            # Extract JSON from response
            import json
            import re

            json_match = re.search(r"\{[^}]+\}", text, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return ReviewAnalysis(
                    sentiment=float(data.get("sentiment", 0)),
                    pros=data.get("pros", [])[:3],
                    cons=data.get("cons", [])[:3],
                    credibility_weight=credibility,
                )
        except Exception as e:
            print(f"Review analysis error: {e}")

        # Default neutral analysis
        return ReviewAnalysis(
            sentiment=0.0,
            pros=[],
            cons=[],
            credibility_weight=credibility,
        )

    async def calculate_rating(
        self,
        product_name: str,
        reviews: list[ScrapedReview],
    ) -> ProductRating:
        """Calculate overall product rating from multiple reviews."""
        if not reviews:
            return ProductRating(
                ai_rating=50,
                confidence=0.0,
                sentiment_score=0.0,
                reliability_score=0.0,
                value_score=0.5,
                popularity_score=0.0,
                sources_analyzed=0,
                pros=[],
                cons=[],
                summary="No reviews available for analysis.",
            )

        # Analyze each review
        analyses: list[ReviewAnalysis] = []
        for review in reviews[:20]:  # Limit to 20 reviews
            analysis = await self.analyze_review(review)
            analyses.append(analysis)

        # Aggregate sentiment (weighted by credibility)
        total_weight = sum(a.credibility_weight for a in analyses)
        if total_weight > 0:
            sentiment_score = sum(a.sentiment * a.credibility_weight for a in analyses) / total_weight
        else:
            sentiment_score = 0.0

        # Aggregate pros and cons (count frequency)
        all_pros: dict[str, int] = {}
        all_cons: dict[str, int] = {}

        for analysis in analyses:
            for pro in analysis.pros:
                pro_lower = pro.lower().strip()
                if pro_lower:
                    all_pros[pro_lower] = all_pros.get(pro_lower, 0) + 1
            for con in analysis.cons:
                con_lower = con.lower().strip()
                if con_lower:
                    all_cons[con_lower] = all_cons.get(con_lower, 0) + 1

        # Get top pros and cons by frequency
        top_pros = sorted(all_pros.items(), key=lambda x: x[1], reverse=True)[:5]
        top_cons = sorted(all_cons.items(), key=lambda x: x[1], reverse=True)[:5]

        # Calculate reliability (consistency of opinions)
        sentiments = [a.sentiment for a in analyses]
        if len(sentiments) > 1:
            import statistics

            sentiment_std = statistics.stdev(sentiments)
            reliability_score = max(0, 1 - sentiment_std)
        else:
            reliability_score = 0.5

        # Calculate popularity (based on engagement)
        total_upvotes = sum(r.upvotes or 0 for r in reviews)
        total_comments = sum(r.comment_count or 0 for r in reviews)
        popularity_raw = (total_upvotes / 100) + (total_comments / 50)
        popularity_score = min(1.0, popularity_raw / len(reviews))

        # Value score (placeholder - would need price comparison)
        value_score = 0.5 + (sentiment_score * 0.2)

        # Calculate confidence based on number of sources and agreement
        source_confidence = min(1.0, len(reviews) / 15)
        confidence = (source_confidence * 0.6) + (reliability_score * 0.4)

        # Calculate final AI rating (0-100)
        # Base: 50, adjusted by sentiment, reliability, value, popularity
        ai_rating = int(
            50
            + (sentiment_score * 30)  # -30 to +30 from sentiment
            + (reliability_score * 10)  # 0 to +10 from reliability
            + (value_score * 5)  # ~2.5 to 3.5 from value
            + (popularity_score * 5)  # 0 to +5 from popularity
        )
        ai_rating = max(0, min(100, ai_rating))

        # Generate summary
        summary = await self._generate_summary(
            product_name,
            sentiment_score,
            [p[0] for p in top_pros],
            [c[0] for c in top_cons],
            len(reviews),
        )

        return ProductRating(
            ai_rating=ai_rating,
            confidence=round(confidence, 2),
            sentiment_score=round(sentiment_score, 2),
            reliability_score=round(reliability_score, 2),
            value_score=round(value_score, 2),
            popularity_score=round(popularity_score, 2),
            sources_analyzed=len(reviews),
            pros=[p[0].capitalize() for p in top_pros],
            cons=[c[0].capitalize() for c in top_cons],
            summary=summary,
        )

    async def _generate_summary(
        self,
        product_name: str,
        sentiment: float,
        pros: list[str],
        cons: list[str],
        num_sources: int,
    ) -> str:
        """Generate a natural language summary of the rating."""
        sentiment_desc = (
            "very positive"
            if sentiment > 0.5
            else "positive"
            if sentiment > 0.2
            else "mixed"
            if sentiment > -0.2
            else "negative"
            if sentiment > -0.5
            else "very negative"
        )

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=150,
                messages=[
                    {
                        "role": "user",
                        "content": f"""Write a 2-sentence summary of user opinions about "{product_name}".

Overall sentiment: {sentiment_desc}
Key pros: {', '.join(pros[:3]) if pros else 'none mentioned'}
Key cons: {', '.join(cons[:3]) if cons else 'none mentioned'}
Sources analyzed: {num_sources}

Be concise and factual. Start with the general consensus.""",
                    }
                ],
            )

            return response.content[0].text.strip()
        except Exception as e:
            print(f"Summary generation error: {e}")
            return f"Based on {num_sources} sources, users have {sentiment_desc} opinions about the {product_name}."


# Create singleton instance
rating_calculator = RatingCalculator()
