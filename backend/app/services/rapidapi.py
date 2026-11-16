import httpx
from app.config import get_settings
from app.services.cache import cache

settings = get_settings()
TTL = {'/search': 6*3600, '/product-details': 24*3600, '/product-offers': 2*3600, '/product-reviews': 24*3600, '/product-price-history': 24*3600, '/deals': 2*3600, '/store-reviews': 24*3600}

class RapidAPIClient:
    async def get(self, endpoint: str, params: dict, timeout: float = 30.0):
        if not settings.rapidapi_key:
            return {'status':'CONFIG_ERROR','message':'Set RAPIDAPI_KEY in backend/.env before using live product search.','data':{}}
        key = cache.key(endpoint, params)
        cached = cache.get(key)
        if cached is not None:
            cached['_cache'] = 'HIT'
            return cached
        if not cache.consume_call():
            return {'status':'QUOTA_GUARD','message':'CartWise has reached its configured monthly API-call budget. Cached results remain available.','data':{},'_cache':'MISS'}
        url = f'https://{settings.rapidapi_host}{endpoint}'
        headers = {'x-rapidapi-key':settings.rapidapi_key,'x-rapidapi-host':settings.rapidapi_host,'Accept':'application/json'}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url, headers=headers, params=params)
            if response.status_code == 429:
                return {'status':'QUOTA_EXCEEDED','message':'RapidAPI rejected the request because its quota or rate limit was reached.','data':{}}
            if response.status_code in (401,403):
                return {'status':'AUTH_ERROR','message':'RapidAPI authentication failed. Check the key and host.','data':{}}
            if response.status_code != 200:
                return {'status':'API_ERROR','message':f'RapidAPI returned HTTP {response.status_code}.','data':{}}
            data = response.json()
            if isinstance(data,dict):
                data['_cache'] = 'MISS'
                cache.set(key, data, TTL.get(endpoint, 3600))
            return data
        except httpx.TimeoutException:
            return {'status':'TIMEOUT','message':'RapidAPI request timed out.','data':{}}
        except (httpx.HTTPError, ValueError) as exc:
            return {'status':'ERROR','message':str(exc),'data':{}}
