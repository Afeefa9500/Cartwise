from app.services.rapidapi import RapidAPIClient


class ProductService:

    def __init__(self):
        self.client = RapidAPIClient()

    async def get_product_details(
        self,
        product_id: str,
        country: str = "us",
        language: str = "en"
    ):
        params = {
            "product_id": product_id,
            "country": country,
            "language": language
        }

        return await self.client.get(
            "/product-details",
            params
        )