from fastapi import APIRouter, Query
from app.config import get_settings

from app.services.search import ProductSearchService
from app.services.product import ProductService
from app.services.reviews import ReviewService
from app.services.deals import DealService
from app.services.offers import OfferService

from app.services.comparison import (
    compare_offers
)

from app.services.review_analysis import (
    analyze_reviews
)

from app.services.cartwise import (
    CartWiseService
)


router = APIRouter(
    prefix="/api"
)


search_service = ProductSearchService()
settings = get_settings()
product_service = ProductService()
review_service = ReviewService()
deal_service = DealService()
offer_service = OfferService()
cartwise_service = CartWiseService()


# ============================================================
# SEARCH
# ============================================================

@router.get("/search")
async def search_products(
    q: str = Query(
        ...,
        min_length=1
    ),

    limit: int = Query(
        10,
        ge=1,
        le=40
    )
):

    return await search_service.search_products(
        query=q,
        limit=limit,
        country=settings.search_country,
        language=settings.search_language
    )


# ============================================================
# PRODUCT DETAILS
# ============================================================

@router.get("/product/{product_id}")
async def get_product(
    product_id: str
):

    return await product_service.get_product_details(
        product_id=product_id
    )


# ============================================================
# OFFERS
# ============================================================

@router.get("/offers/{product_id}")
async def get_offers(
    product_id: str,

    page: int = Query(
        1,
        ge=1
    )
):

    response = (
        await offer_service.get_product_offers(
            product_id=product_id,
            page=page
        )
    )

    data = response.get(
        "data",
        {}
    )

    offers = data.get(
        "offers",
        []
    )

    return {
        "status":
            response.get(
                "status",
                "success"
            ),

        "product_id":
            data.get(
                "product_id"
            ),

        "product_title":
            data.get(
                "product_title"
            ),

        "product_rating":
            data.get(
                "product_rating"
            ),

        "product_num_reviews":
            data.get(
                "product_num_reviews"
            ),

        "offers":
            compare_offers(
                offers
            )
    }


# ============================================================
# REVIEWS
# ============================================================

@router.get("/reviews/{product_id}")
async def get_reviews(
    product_id: str,

    limit: int = Query(
        10,
        ge=1,
        le=50
    )
):

    response = (
        await review_service.get_product_reviews(
            product_id=product_id,
            limit=limit
        )
    )

    data = response.get(
        "data",
        {}
    )

    reviews = data.get(
        "reviews",
        []
    )

    analysis = analyze_reviews(
        reviews=reviews,

        product_rating=
            data.get(
                "product_rating"
            ),

        product_num_reviews=
            data.get(
                "product_num_reviews"
            ),

        reviews_per_rating=
            data.get(
                "reviews_per_rating"
            )
    )

    return {
        "status":
            response.get(
                "status",
                "success"
            ),

        "product_id":
            product_id,

        "product_rating":
            data.get(
                "product_rating"
            ),

        "product_num_reviews":
            data.get(
                "product_num_reviews"
            ),

        "reviews_per_rating":
            data.get(
                "reviews_per_rating"
            ),

        "reviews":
            reviews,

        "analysis":
            analysis
    }


# ============================================================
# DEALS
# ============================================================

@router.get("/deals")
async def get_deals(
    q: str | None = None,

    limit: int = Query(
        10,
        ge=1,
        le=40
    )
):

    return await deal_service.get_deals(
        query=q,
        limit=limit
    )


# ============================================================
# CARTWISE MAIN ENDPOINT
# ============================================================

@router.get("/cartwise")
async def analyze_cartwise(
    q: str = Query(
        ...,
        min_length=1
    )
):

    return await cartwise_service.analyze_product(
        q
    )
# API usage monitor: does not make a RapidAPI request.
from app.services.cache import cache as quota_cache

@router.get('/usage')
def api_usage():
    return quota_cache.usage()

from app.services.price_history import PriceHistoryService
price_history_service = PriceHistoryService()

@router.get('/price-history/{product_id}')
async def get_price_history(product_id: str):
    return await price_history_service.get_price_history(
        product_id=product_id,
        country=settings.search_country,
        language=settings.search_language,
    )
