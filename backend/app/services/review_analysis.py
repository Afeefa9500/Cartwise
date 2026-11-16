from collections import Counter
from typing import Any
import re


POSITIVE_WORDS = {
    "good", "great", "love", "loved", "amazing", "excellent",
    "perfect", "beautiful", "nice", "comfortable", "smooth",
    "soft", "durable", "quality", "worth", "recommend",
    "recommended", "easy", "effective", "lightweight",
    "pigmented", "lasting", "long", "fresh", "clean"
}

NEGATIVE_WORDS = {
    "bad", "poor", "worst", "hate", "hated", "terrible",
    "disappointed", "disappointing", "dry", "drying",
    "smudge", "smudging", "transfer", "crack", "cracking",
    "broken", "cheap", "uncomfortable", "itchy", "oily",
    "greasy", "heavy", "small", "weak", "short"
}


def clean_words(text: str) -> list[str]:
    return re.findall(
        r"\b[a-zA-Z]+\b",
        text.lower()
    )


def analyze_reviews(
    reviews: list[dict[str, Any]],
    product_rating: float | None = None,
    product_num_reviews: int | None = None,
    reviews_per_rating: dict | None = None
) -> dict:

    if not reviews and product_rating is None:
        return {
            "sentiment": "Insufficient Data",
            "recommendation": "Not enough review data",
            "product_rating": None,
            "product_num_reviews": product_num_reviews,
            "reviews_analyzed": 0,
            "positive_mentions": {},
            "negative_mentions": {},
            "positive_score": 0,
            "negative_score": 0,
            "final_score": 0
        }

    positive = Counter()
    negative = Counter()

    for review in reviews:

        text = (
            review.get("review_text")
            or review.get("text")
            or review.get("review")
            or ""
        )

        words = clean_words(text)

        for word in words:

            if word in POSITIVE_WORDS:
                positive[word] += 1

            if word in NEGATIVE_WORDS:
                negative[word] += 1

    positive_score = sum(
        positive.values()
    )

    negative_score = sum(
        negative.values()
    )

    # ---------------------------------------------------------
    # RATING SCORE
    # ---------------------------------------------------------

    rating_score = 0

    if product_rating is not None:

        if product_rating >= 4.5:
            rating_score = 4

        elif product_rating >= 4.0:
            rating_score = 3

        elif product_rating >= 3.5:
            rating_score = 1

        elif product_rating >= 3.0:
            rating_score = -1

        else:
            rating_score = -3

    # ---------------------------------------------------------
    # RATING DISTRIBUTION
    # ---------------------------------------------------------

    distribution_score = 0

    if reviews_per_rating:

        five = int(
            reviews_per_rating.get("5", 0)
        )

        four = int(
            reviews_per_rating.get("4", 0)
        )

        three = int(
            reviews_per_rating.get("3", 0)
        )

        two = int(
            reviews_per_rating.get("2", 0)
        )

        one = int(
            reviews_per_rating.get("1", 0)
        )

        total = (
            five + four + three + two + one
        )

        if total > 0:

            positive_ratio = (
                five + four
            ) / total

            negative_ratio = (
                one + two
            ) / total

            if positive_ratio >= 0.80:
                distribution_score = 3

            elif positive_ratio >= 0.65:
                distribution_score = 2

            elif negative_ratio >= 0.35:
                distribution_score = -3

            elif negative_ratio >= 0.20:
                distribution_score = -2

    # ---------------------------------------------------------
    # TEXT SENTIMENT
    # ---------------------------------------------------------

    text_score = 0

    if positive_score > negative_score * 1.5:
        text_score = 1

    elif negative_score > positive_score * 1.5:
        text_score = -1

    # ---------------------------------------------------------
    # FINAL SCORE
    # ---------------------------------------------------------

    final_score = (
        rating_score
        + distribution_score
        + text_score
    )

    if final_score >= 5:

        sentiment = "Positive"
        recommendation = "Recommended"

    elif final_score >= 2:

        sentiment = "Mostly Positive"
        recommendation = "Generally Recommended"

    elif final_score >= -1:

        sentiment = "Mixed"
        recommendation = "Consider with caution"

    else:

        sentiment = "Negative"
        recommendation = "Not Recommended"

    return {
        "sentiment": sentiment,
        "recommendation": recommendation,

        "product_rating":
            product_rating,

        "product_num_reviews":
            product_num_reviews,

        "reviews_analyzed":
            len(reviews),

        "positive_mentions":
            dict(positive),

        "negative_mentions":
            dict(negative),

        "positive_score":
            positive_score,

        "negative_score":
            negative_score,

        "rating_score":
            rating_score,

        "distribution_score":
            distribution_score,

        "text_sentiment_score":
            text_score,

        "final_score":
            final_score
    }