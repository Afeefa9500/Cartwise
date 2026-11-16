from app.services.rapidapi import RapidAPIClient

class ProductSearchService:
    def __init__(self):
        self.client = RapidAPIClient()

    async def search_products(self, query: str, limit: int = 10, page: int = 1,
                              country: str = 'us', language: str = 'en'):
        # Preserve the user's exact search intent; no automatic typo rewriting.
        params = {
            'q': query.strip(),
            'country': country,
            'language': language,
            'page': page,
            'limit': limit,
            'sort_by': 'BEST_MATCH',
            'product_condition': 'NEW',
        }
        response = await self.client.get('/search', params)
        if isinstance(response, dict):
            response.setdefault('original_query', query)
            response.setdefault('corrected_query', query)
        return response
