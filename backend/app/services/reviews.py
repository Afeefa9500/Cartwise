from app.services.rapidapi import RapidAPIClient


class ReviewService:

    def __init__(self):
        self.client = RapidAPIClient()

    async def get_product_reviews(
        self,
        product_id: str,
        rating: int | None = None,
        sort_by: str | None = None,
        cursor: str | None = None,
        limit: int = 10,
        country: str = "us",
        language: str = "en"
    ):
        params = {
            "product_id": product_id,
            "limit": limit,
            "country": country,
            "language": language
        }

        if rating is not None:
            params["rating"] = rating

        if sort_by is not None:
            params["sort_by"] = sort_by

        if cursor is not None:
            params["cursor"] = cursor

        return await self.client.get(
            "/product-reviews",
            params
        )