
from typing import Any

from app.services.search import ProductSearchService
from app.services.offers import OfferService
from app.services.reviews import ReviewService

from app.services.comparison import compare_offers

from app.services.ranking import (
    rank_by_value,
    rank_by_rating,
    get_cheapest_product
)

from app.services.review_analysis import analyze_reviews
from app.services.product_matcher import ProductMatcher


def get_first_value(data: dict, *keys):
    """Return the first available non-empty value from a dictionary."""
    for key in keys:
        value = data.get(key)
        if value is not None:
            return value
    return None


class CartWiseService:

    def __init__(self):
        self.search_service = ProductSearchService()
        self.offer_service = OfferService()
        self.review_service = ReviewService()
        self.product_matcher = ProductMatcher()

    async def analyze_product(
        self,
        query: str
    ) -> dict[str, Any]:

        # -------------------------------------------------
        # SEARCH PRODUCTS
        # -------------------------------------------------

        search_response = (
            await self.search_service.search_products(
                query=query,
                limit=10,
                country="us",
                language="en"
            )
        )

        # -------------------------------------------------
        # NO RESPONSE
        # -------------------------------------------------

        if not search_response:
            return {
                "status": "NO_RESULTS",
                "query": query,
                "products": []
            }

        # -------------------------------------------------
        # API ERRORS
        # -------------------------------------------------

        if search_response.get("status") in {
            "QUOTA_EXCEEDED",
            "API_ERROR",
            "TIMEOUT",
            "ERROR"
        }:
            return {
                "status": search_response.get("status"),
                "message": search_response.get("message"),
                "query": query,
                "products": []
            }

        # -------------------------------------------------
        # GET PRODUCTS
        # -------------------------------------------------

        data = search_response.get("data", {})
        products = data.get("products", [])

        # -------------------------------------------------
        # NO PRODUCTS FROM API
        # -------------------------------------------------

        if not products:
            return {
                "status": "NO_PRODUCTS",
                "query": query,
                "products": []
            }

        # -------------------------------------------------
        # MATCH / RANK PRODUCTS
        # -------------------------------------------------

        matched_products = (
            self.product_matcher.rank_products(
                query=query,
                products=products
            )
        )

        # -------------------------------------------------
        # TAKE TOP 3 MATCHED PRODUCTS
        # -------------------------------------------------

        matched_products = matched_products[:3]

        # -------------------------------------------------
        # SAFETY CHECK
        # -------------------------------------------------

        if not matched_products:
            return {
                "status": "NO_MATCHING_PRODUCTS",
                "query": query,
                "products": []
            }

        # -------------------------------------------------
        # PROCESS PRODUCTS
        # -------------------------------------------------

        processed_products = []

        for matched in matched_products:

            product = matched["product"]
            product_id = product.get("product_id")

            # -------------------------------------------------
            # BASIC PRODUCT INFORMATION
            # -------------------------------------------------

            product_match = matched.get("match", {})

            product_result = {
                "product_id": product_id,

                "product_title": product.get(
                    "product_title"
                ),

                "product_url": product.get(
                    "product_page_url"
                ),

                "source": product.get(
                    "source"
                ),

                "price": product.get(
                    "price"
                ),

                "rating": product.get(
                    "product_rating"
                ),

                "review_count": product.get(
                    "product_num_reviews"
                ),

                # Keep only essential matching information
                "product_match": {
                    "score": product_match.get(
                        "final_match_score"
                    ),
                    "level": product_match.get(
                        "match_level"
                    )
                },

                "offers": [],

                "review_analysis": None
            }

            # -------------------------------------------------
            # GET PRODUCT OFFERS
            # -------------------------------------------------

            if product_id:

                try:

                    offer_response = (
                        await self.offer_service
                        .get_product_offers(
                            product_id=product_id,
                            country="us",
                            language="en"
                        )
                    )

                    offer_data = offer_response.get(
                        "data",
                        {}
                    )

                    offers = offer_data.get(
                        "offers",
                        []
                    )

                    # Compare offers
                    compared_offers = compare_offers(
                        offers
                    )

                    product_result["offers"] = (
                        compared_offers
                    )

                except Exception as error:

                    print(
                        f"Offer retrieval failed for "
                        f"{product_id}: {error}"
                    )

                    product_result["offers"] = []

            # -------------------------------------------------
            # GET PRODUCT REVIEWS
            # -------------------------------------------------

            if product_id:

                try:

                    review_response = (
                        await self.review_service
                        .get_product_reviews(
                            product_id=product_id,
                            limit=10,
                            country="us",
                            language="en"
                        )
                    )

                    review_data = review_response.get(
                        "data",
                        {}
                    )

                    reviews = review_data.get(
                        "reviews",
                        []
                    )

                    product_result["review_analysis"] = (
                        analyze_reviews(
                            reviews=reviews,

                            product_rating=review_data.get(
                                "product_rating"
                            ),

                            product_num_reviews=review_data.get(
                                "product_num_reviews"
                            ),

                            reviews_per_rating=review_data.get(
                                "reviews_per_rating"
                            )
                        )
                    )

                except Exception as error:

                    print(
                        f"Review retrieval failed for "
                        f"{product_id}: {error}"
                    )

                    product_result["review_analysis"] = {
                        "sentiment": "Insufficient Data",
                        "recommendation": "Not enough review data",
                        "reviews_analyzed": 0
                    }

            # -------------------------------------------------
            # ADD PROCESSED PRODUCT
            # -------------------------------------------------

            processed_products.append(
                product_result
            )

        # -------------------------------------------------
        # PREPARE PRODUCTS FOR RANKING
        # -------------------------------------------------

        ranking_products = []

        for product in processed_products:

            ranking_products.append({

                "product_id": product.get(
                    "product_id"
                ),

                "product_title": product.get(
                    "product_title"
                ),

                "price": product.get(
                    "price"
                ),

                "product_rating": product.get(
                    "rating"
                ),

                "product_num_reviews": product.get(
                    "review_count"
                )
            })

        # -------------------------------------------------
        # CHEAPEST PRODUCT
        # -------------------------------------------------

        cheapest_product = get_cheapest_product(
            ranking_products
        )

        # -------------------------------------------------
        # BEST VALUE
        # -------------------------------------------------

        value_ranking = rank_by_value(
            ranking_products
        )

        # -------------------------------------------------
        # BEST RATED
        # -------------------------------------------------

        rating_ranking = rank_by_rating(
            ranking_products
        )

        # -------------------------------------------------
        # PRODUCT IDS
        # -------------------------------------------------

        cheapest_id = (
            cheapest_product.get("product_id")
            if cheapest_product
            else None
        )

        best_value_id = (
            value_ranking[0].get("product_id")
            if value_ranking
            else None
        )

        best_rated_id = (
            rating_ranking[0].get("product_id")
            if rating_ranking
            else None
        )

        # -------------------------------------------------
        # COMPACT RANKINGS
        # -------------------------------------------------

        rankings = {
            "cheapest_product": cheapest_id,
            "best_value": best_value_id,
            "best_rated": best_rated_id
        }

        # -------------------------------------------------
        # COLLECT ALL OFFERS
        # -------------------------------------------------

        all_offers = []

        for product in processed_products:

            offers = product.get(
                "offers",
                []
            )

            for offer in offers:

                offer_copy = offer.copy()

                offer_copy["product_id"] = (
                    product.get("product_id")
                )

                offer_copy["product_title"] = (
                    product.get("product_title")
                )

                all_offers.append(
                    offer_copy
                )

        # -------------------------------------------------
        # FIND BEST DEAL
        # -------------------------------------------------

        best_deal = None

        if all_offers:

            compared_all_offers = compare_offers(
                all_offers
            )

            if compared_all_offers:

                best_deal = compared_all_offers[0]

        # -------------------------------------------------
        # FALLBACK TO CHEAPEST PRODUCT
        # -------------------------------------------------

        if best_deal is None:
            best_deal = cheapest_product

        # -------------------------------------------------
        # FORMAT BEST DEAL
        # -------------------------------------------------

        if best_deal:

            best_deal = {
                "product_id": best_deal.get(
                    "product_id"
                ),

                "product_title": best_deal.get(
                    "product_title"
                ),

                "seller": get_first_value(
                    best_deal,
                    "store_name",
                    "seller",
                    "merchant",
                    "store",
                    "offer_store_name"
                ),

                "price": best_deal.get(
                    "price"
                ),

                "shipping_cost": best_deal.get(
                    "shipping_cost"
                ),

                "total_cost": best_deal.get(
                    "total_cost"
                ),

                "currency": get_first_value(
                    best_deal,
                    "total_cost_currency",
                    "price_currency"
                ),

                "url": get_first_value(
                    best_deal,
                    "offer_page_url",
                    "offer_url",
                    "product_url",
                    "url"
                )
            }

        # -------------------------------------------------
        # FINAL RESPONSE
        # -------------------------------------------------

        return {
            "status": "success",

            "query": query,

            "product_count": len(
                processed_products
            ),

            "products": processed_products,

            "best_deal": best_deal,

            "rankings": rankings
        }
