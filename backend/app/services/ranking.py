from typing import Any


def get_numeric_price(product: dict[str, Any]) -> float | None:
    """
    Extract a usable numeric price from a product.
    Supports common price fields returned by APIs.
    """

    possible_fields = [
        "price",
        "product_price",
        "merchant_price",
        "numeric_price",
        "total_cost"
    ]

    for field in possible_fields:

        value = product.get(field)

        if value is None:
            continue

        try:
            if isinstance(value, (int, float)):
                return float(value)

            cleaned = (
                str(value)
                .replace(",", "")
                .replace("$", "")
                .replace("₹", "")
                .replace("€", "")
                .replace("£", "")
                .strip()
            )

            return float(cleaned)

        except (ValueError, TypeError):
            continue

    return None


def get_rating(product: dict[str, Any]) -> float:
    """
    Extract product rating.
    """

    possible_fields = [
        "product_rating",
        "rating",
        "average_rating"
    ]

    for field in possible_fields:

        value = product.get(field)

        if value is None:
            continue

        try:
            return float(value)
        except (ValueError, TypeError):
            continue

    return 0.0


def get_review_count(product: dict[str, Any]) -> int:
    """
    Extract number of reviews.
    """

    possible_fields = [
        "product_num_reviews",
        "review_count",
        "reviews_count",
        "num_reviews"
    ]

    for field in possible_fields:

        value = product.get(field)

        if value is None:
            continue

        try:
            return int(value)
        except (ValueError, TypeError):
            continue

    return 0
 
# VALUE SCORE
 

def calculate_value_score(
    product: dict[str, Any]
) -> float:

    price = get_numeric_price(product)

    rating = get_rating(product)

    reviews = get_review_count(product)

    if price is None or price <= 0:
        return 0.0
 
    rating_score = (
        rating / 5.0
        if rating > 0
        else 0.0
    )
 

    review_score = min(
        reviews / 1000.0,
        1.0
    )

     

    price_score = 1 / price

    raw_score = (
        rating_score * 0.60
        + review_score * 0.20
        + price_score * 0.20
    )

    return raw_score
 
# NORMALIZE VALUE SCORES
 

def normalize_scores(
    products: list[dict[str, Any]]
) -> list[dict[str, Any]]:

    if not products:
        return []

    scores = [
        product.get(
            "_raw_value_score",
            0.0
        )
        for product in products
    ]

    maximum = max(scores)
    minimum = min(scores)

    if maximum == minimum:

        for product in products:
            product["value_score"] = 50.0

        return products

    for product in products:

        raw = product.get(
            "_raw_value_score",
            0.0
        )

        normalized = (
            (raw - minimum)
            /
            (maximum - minimum)
        ) * 100

        product["value_score"] = round(
            normalized,
            2
        )

    return products
 
# RANK BY VALUE
 

def rank_by_value(
    products: list[dict[str, Any]]
) -> list[dict[str, Any]]:

    if not products:
        return []

    prepared = []

    for product in products:

        product_copy = product.copy()

        product_copy["_raw_value_score"] = (
            calculate_value_score(
                product_copy
            )
        )

        prepared.append(
            product_copy
        )

    prepared = normalize_scores(
        prepared
    )

    for product in prepared:

        product.pop(
            "_raw_value_score",
            None
        )

    return sorted(
        prepared,
        key=lambda product:
            product.get(
                "value_score",
                0
            ),
        reverse=True
    )

 
# RANK BY RATING
 
def rank_by_rating(
    products: list[dict[str, Any]]
) -> list[dict[str, Any]]:

    if not products:
        return []

    ranked = []

    for product in products:

        product_copy = product.copy()

        rating = get_rating(
            product_copy
        )

        reviews = get_review_count(
            product_copy
        )

       
        confidence = min(
            reviews / 1000.0,
            1.0
        )

        rating_score = (
            rating / 5.0
        )

        final_score = (
            rating_score * 0.85
            +
            confidence * 0.15
        )

        product_copy["rating_score"] = round(
            final_score * 100,
            2
        )

        ranked.append(
            product_copy
        )

    return sorted(
        ranked,
        key=lambda product:
            (
                get_rating(product),
                get_review_count(product)
            ),
        reverse=True
    )
 
# GET CHEAPEST PRODUCT
 

def get_cheapest_product(
    products: list[dict[str, Any]]
) -> dict[str, Any] | None:

    valid_products = []

    for product in products:

        price = get_numeric_price(
            product
        )

        if price is not None and price >= 0:

            valid_products.append(
                (price, product)
            )

    if not valid_products:
        return None

    valid_products.sort(
        key=lambda item: item[0]
    )

    cheapest_price, cheapest_product = (
        valid_products[0]
    )

    result = cheapest_product.copy()

    result["numeric_price"] = round(
        cheapest_price,
        2
    )

    return result