from pydantic import BaseModel
from typing import Optional


class Product(BaseModel):
    product_id: str
    product_title: str

    price: Optional[float] = None
    original_price: Optional[float] = None

    product_page_url: Optional[str] = None
    product_photos: list[str] = []

    store_name: Optional[str] = None

    on_sale: bool = False
    discount_percent: Optional[float] = None

    product_rating: Optional[float] = None
    product_num_reviews: Optional[int] = None

    return_policy: Optional[str] = None
    shipping: Optional[str] = None

    has_multiple_offers: bool = False