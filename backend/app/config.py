from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to this file, not PowerShell's current working directory.
# This keeps configuration loading reliable whether Uvicorn is started from
# the project root or from the backend directory.
BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    rapidapi_key: str = ""
    rapidapi_host: str = "real-time-product-search.p.rapidapi.com"
    rapidapi_monthly_limit: int = 100
    rapidapi_reserve_calls: int = 10
    cache_db_path: str = "data/cartwise_cache.sqlite3"
    search_country: str = "us"
    search_language: str = "en"

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
