from pydantic import BaseModel
from typing import Optional


class Deal(BaseModel):
    product_id: Optional[str] = None
    product_title: Optional[str] = None

    price: Optional[float] = None
    original_price: Optional[float] = None
    discount_percent: Optional[float] = None

    product_page_url: Optional[str] = None
    store_name: Optional[str] = None

    product_rating: Optional[float] = None
    product_num_reviews: Optional[int] = None

    shipping: Optional[str] = None
    return_policy: Optional[str] = None