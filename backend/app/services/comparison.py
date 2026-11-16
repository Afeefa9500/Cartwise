import re
from typing import Any
 
# PRICE PARSING
 

def extract_price(
    price: Any
) -> float | None:

    if price is None:
        return None

    if isinstance(price, (int, float)):

        return float(price)

    text = str(price).strip()

    if not text:
        return None

    # Remove commas used as thousands separators
    text = text.replace(",", "")

    # Prefer a number immediately after a currency symbol/code.
    currency_match = re.search(
        r"(?:[$₹€£]|USD|INR|EUR|GBP)\s*"
        r"(\d+(?:\.\d{1,2})?)",
        text,
        re.IGNORECASE
    )

    if currency_match:

        try:
            return float(
                currency_match.group(1)
            )
        except ValueError:
            pass

    # Otherwise find a decimal/number.
    number_match = re.search(
        r"\b\d+(?:\.\d{1,2})?\b",
        text
    )

    if not number_match:
        return None

    try:

        return float(
            number_match.group(0)
        )

    except ValueError:

        return None

 

def detect_currency(
    value: Any
) -> str | None:

    if value is None:
        return None

    text = str(value).lower()

    # Check currency codes first

    if "inr" in text:
        return "INR"

    if "usd" in text:
        return "USD"

    if "eur" in text:
        return "EUR"

    if "gbp" in text:
        return "GBP"

    # Currency symbols

    if "₹" in text:
        return "INR"

    if "$" in text:
        return "USD"

    if "€" in text:
        return "EUR"

    if "£" in text:
        return "GBP"

    return None
 
# SHIPPING COST
 

def extract_shipping_cost(
    shipping: Any
) -> float:

    if shipping is None:
        return 0.0

    text = str(shipping).strip()

    if not text:
        return 0.0

    lower_text = text.lower()
 

    if any(
        phrase in lower_text
        for phrase in [
            "free shipping",
            "free delivery",
            "shipping free",
            "delivery free"
        ]
    ):

        return 0.0

    
    currency_match = re.search(
        r"(?:[$₹€£]|USD|INR|EUR|GBP)\s*"
        r"(\d+(?:\.\d{1,2})?)",
        text,
        re.IGNORECASE
    )

    if currency_match:

        try:

            return float(
                currency_match.group(1)
            )

        except ValueError:

            pass
 

    shipping_match = re.search(
        r"(?:shipping|delivery|postage|freight)"
        r"\D{0,15}"
        r"(\d+(?:\.\d{1,2})?)",
        lower_text,
        re.IGNORECASE
    )

    if shipping_match:

        try:

            return float(
                shipping_match.group(1)
            )

        except ValueError:

            pass

    return 0.0
 
# GET OFFER PRICE 

def get_offer_price(
    offer: dict[str, Any]
) -> tuple[
    float | None,
    str | None
]:

    # --------------------------------------------------------
    # Merchant price
    # --------------------------------------------------------

    merchant_price = offer.get(
        "merchant_price"
    )

    merchant_currency = offer.get(
        "merchant_currency"
    )

    if merchant_price is not None:

        try:

            price = float(
                merchant_price
            )

            currency = (
                str(
                    merchant_currency
                ).upper()
                if merchant_currency
                else None
            )

            return price, currency

        except (
            ValueError,
            TypeError
        ):

            pass
 
    # Normal price field
   

    price = offer.get(
        "price"
    )

    if price is None:

        price = offer.get(
            "product_price"
        )

    if price is None:

        return None, None

    return (
        extract_price(price),
        detect_currency(price)
    )
 
# TOTAL COST
 

def calculate_total_cost(
    offer: dict[str, Any]
) -> float | None:

    product_price, currency = (
        get_offer_price(offer)
    )

    if product_price is None:

        return None

    shipping = offer.get(
        "shipping"
    )

    shipping_cost = (
        extract_shipping_cost(
            shipping
        )
    )
 
    # Free shipping / no shipping
    

    if shipping_cost == 0:

        return round(
            product_price,
            2
        )

    

    shipping_currency = (
        detect_currency(
            shipping
        )
    )

    if (
        currency
        and shipping_currency
        and currency != shipping_currency
    ):

        return round(
            product_price,
            2
        )

    return round(
        product_price
        + shipping_cost,
        2
    )

 
# COMPARE OFFERS
 

def compare_offers(
    offers: list[dict]
) -> list[dict]:

    valid_offers = []

    for offer in offers:

        if not isinstance(
            offer,
            dict
        ):
            continue

        offer_copy = offer.copy()

        product_price, currency = (
            get_offer_price(
                offer
            )
        )

        # Ignore offers without a valid price

        if product_price is None:
            continue

        shipping_cost = (
            extract_shipping_cost(
                offer.get(
                    "shipping"
                )
            )
        )

        total_cost = (
            calculate_total_cost(
                offer
            )
        )

        offer_copy[
            "numeric_price"
        ] = round(
            product_price,
            2
        )

        offer_copy[
            "price_currency"
        ] = currency

        offer_copy[
            "shipping_cost"
        ] = round(
            shipping_cost,
            2
        )

        offer_copy[
            "total_cost"
        ] = total_cost

        offer_copy[
            "total_cost_currency"
        ] = currency

        valid_offers.append(
            offer_copy
        )

    return sorted(
        valid_offers,
        key=lambda offer: (
            offer.get(
                "total_cost"
            )
            if offer.get(
                "total_cost"
            ) is not None
            else float("inf")
        )
    )

# CHEAPEST OFFER
 

def get_cheapest_offer(
    offers: list[dict]
) -> dict | None:

    compared_offers = (
        compare_offers(
            offers
        )
    )

    if not compared_offers:

        return None

    return compared_offers[0]