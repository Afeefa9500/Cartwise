import re
from difflib import get_close_matches
 
# SEARCH VOCABULARY
 

SEARCH_VOCABULARY = {
    # Brands
    "apple", "samsung", "google", "pixel", "oneplus",
    "xiaomi", "redmi", "realme", "oppo", "vivo",
    "motorola", "nokia", "sony", "lg", "asus",
    "acer", "lenovo", "hp", "dell", "msi",

    "nike", "adidas", "puma", "reebok", "zara",
    "uniqlo", "levis",

    "maybelline", "loreal", "nykaa", "lakme",
    "revlon", "clinique", "nivea", "neutrogena",
    "cerave",

    # Electronics
    "phone", "smartphone", "iphone", "tablet",
    "laptop", "computer", "macbook", "monitor",
    "camera", "headphones", "earbuds", "airpods",
    "watch", "smartwatch", "keyboard", "mouse",
    "speaker", "charger", "powerbank",

    # Fashion
    "shirt", "tshirt", "hoodie", "sweater",
    "jacket", "dress", "jeans", "pants",
    "saree", "kurti", "kurta", "shoes",
    "sneakers", "boots", "sandals", "slippers",

    # Beauty / skincare
    "makeup", "lipstick", "foundation", "mascara",
    "perfume", "skincare", "moisturizer", "serum",
    "cleanser", "sunscreen", "toner", "cream",
    "lotion",

    # Bags
    "bag", "handbag", "backpack", "wallet"
}
 
# PRODUCT TITLE NORMALIZATION
 

def normalize_product_title(title: str) -> str:
    """
    Normalize a product title for product matching.

    Used by ProductMatcher.
    """

    if not title:
        return ""

    # Convert to string and lowercase
    title = str(title).lower()

    # Remove special characters
    title = re.sub(r"[^a-z0-9\s]", " ", title)

    # Remove extra whitespace
    title = re.sub(r"\s+", " ", title).strip()

    return title
 
# SEARCH QUERY TYPO CORRECTION
 
def correct_search_query(query: str) -> str:
    """
    Correct obvious spelling mistakes in product/brand terms
    before sending the query to RapidAPI.

    Examples:
        samsng phone -> samsung phone
        mackbook 13 -> macbook 13
        IPHONE -> iphone
    """

    query = str(query or "").lower().strip()

    if not query:
        return query

    corrected_tokens = []

    for token in query.split():
 
        if any(char.isdigit() for char in token):
            corrected_tokens.append(token)
            continue
 
        if token in SEARCH_VOCABULARY:
            corrected_tokens.append(token)
            continue 
        matches = get_close_matches(
            token,
            SEARCH_VOCABULARY,
            n=1,
            cutoff=0.82
        )

        if matches:
            corrected_tokens.append(matches[0])
        else: 
            corrected_tokens.append(token)

    return " ".join(corrected_tokens)