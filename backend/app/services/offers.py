from app.services.rapidapi import RapidAPIClient


class OfferService:

    def __init__(self):
        self.client = RapidAPIClient()

    async def get_product_offers(
        self,
        product_id: str,
        country: str = "us",
        page: int = 1,
        language: str = "en"
    ):
        params = {
            "product_id": product_id,
            "country": country,
            "page": page,
            "language": language
        }

        return await self.client.get(
            "/product-offers",
            params
        )