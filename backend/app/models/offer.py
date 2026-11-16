from pydantic import BaseModel
from typing import Optional


class Offer(BaseModel):
    offer_id: str
    offer_title: Optional[str] = None
    offer_page_url: Optional[str] = None

    price: Optional[str] = None
    original_price: Optional[str] = None

    on_sale: bool = False

    shipping: Optional[str] = None
    returns: Optional[str] = None
    product_condition: Optional[str] = None

    store_name: Optional[str] = None
    merchant_id: Optional[str] = None

    store_rating: Optional[float] = None
    store_review_count: Optional[int] = None

    payment_methods: Optional[str] = None