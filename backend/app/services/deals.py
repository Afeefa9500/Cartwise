from app.services.rapidapi import RapidAPIClient


class DealService:

    def __init__(self):
        self.client = RapidAPIClient()

    async def get_deals(
        self,
        query: str | None = None,
        country: str = "in",
        language: str = "en",
        page: int = 1,
        limit: int = 10
    ):
        params = {
            "country": country,
            "language": language,
            "page": page,
            "limit": limit
        }

        if query:
            params["q"] = query

        return await self.client.get(
            "/deals",
            params
        )