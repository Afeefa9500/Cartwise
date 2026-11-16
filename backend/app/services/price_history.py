from app.services.rapidapi import RapidAPIClient

class PriceHistoryService:
    def __init__(self):
        self.client = RapidAPIClient()

    async def get_price_history(self, product_id: str, country: str = 'us', language: str = 'en'):
        return await self.client.get('/product-price-history', {
            'product_id': product_id,
            'country': country,
            'language': language,
        })
