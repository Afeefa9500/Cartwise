import re
from typing import Any

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.utils.normalizer import normalize_product_title


class ProductMatcher:

    CATEGORY_KEYWORDS = {
        "electronics": {
            "phone", "smartphone", "iphone", "android", "tablet",
            "laptop", "computer", "macbook", "monitor", "tv",
            "television", "camera", "headphones", "earbuds", "watch",
            "smartwatch", "keyboard", "mouse", "speaker", "console",
            "gaming", "charger", "powerbank"
        },

        "fashion": {
            "shirt", "tshirt", "t-shirt", "top", "hoodie", "sweater",
            "jacket", "coat", "dress", "skirt", "jeans", "pants",
            "trousers", "shorts", "saree", "sari", "kurti", "kurta",
            "lehenga", "blouse", "sweatshirt", "clothing", "apparel"
        },

        "footwear": {
            "shoes", "shoe", "sneakers", "sneaker", "boots", "boot",
            "sandals", "sandals", "slippers", "heels", "flats",
            "loafers", "footwear", "running"
        },

        "beauty": {
            "makeup", "lipstick", "lip", "foundation", "concealer",
            "mascara", "eyeliner", "eyeshadow", "blush", "bronzer",
            "highlighter", "primer", "beauty", "cosmetic", "nail",
            "nailpolish", "perfume", "fragrance"
        },

        "skincare": {
            "skincare", "moisturizer", "moisturiser", "serum",
            "cleanser", "facewash", "face", "sunscreen", "toner",
            "cream", "lotion", "gel", "oil", "scrub"
        },

        "bags": {
            "bag", "handbag", "backpack", "purse", "wallet",
            "clutch", "tote", "sling", "luggage", "suitcase"
        }
    }

    COLORS = {
        "black", "white", "blue", "red", "green", "yellow",
        "pink", "purple", "silver", "gold", "gray", "grey",
        "orange", "brown", "beige", "cream", "maroon",
        "navy", "violet", "teal"
    }

    MATERIALS = {
        "cotton", "leather", "denim", "silk", "wool", "linen",
        "polyester", "nylon", "canvas", "suede", "velvet",
        "plastic", "metal", "steel"
    }

    FITS = {
        "slim", "regular", "relaxed", "oversized", "loose",
        "straight", "skinny", "wide", "cropped", "fitted"
    }

    FINISHES = {
        "matte", "glossy", "gloss", "shimmer", "metallic",
        "satin", "dewy", "natural"
    }

    COMMON_BRANDS = {
        "apple", "samsung", "google", "pixel", "oneplus",
        "xiaomi", "redmi", "realme", "oppo", "vivo", "motorola",
        "nokia", "sony", "lg", "asus", "acer", "lenovo", "hp",
        "dell", "msi", "nike", "adidas", "puma", "reebok",
        "zara", "hm", "h&m", "uniqlo", "levis", "levi's",
        "maybelline", "loreal", "l'oreal", "nykaa", "mac",
        "lakme", "revlon", "estee", "clinique", "nivea",
        "neutrogena", "cerave", "the", "ordinary"
    }

    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            ngram_range=(1, 2)
        )

    # ---------------------------------------------------------
    # BASIC TOKENIZATION
    # ---------------------------------------------------------

    def _tokens(self, text: str) -> set[str]:

        normalized = normalize_product_title(text)

        return {
            token
            for token in normalized.split()
            if token
        }

    # ---------------------------------------------------------
    # CATEGORY DETECTION
    # ---------------------------------------------------------

    def detect_category(self, text: str) -> str:

        tokens = self._tokens(text)

        scores = {}

        for category, keywords in self.CATEGORY_KEYWORDS.items():

            score = len(tokens.intersection(keywords))

            if score > 0:
                scores[category] = score

        if not scores:
            return "generic"

        return max(
            scores,
            key=scores.get
        )

    # ---------------------------------------------------------
    # BRAND EXTRACTION
    # ---------------------------------------------------------

    def extract_brand(self, tokens: set[str]) -> str | None:

        for token in tokens:

            if token in self.COMMON_BRANDS:
                return token

        return None

    # ---------------------------------------------------------
    # ATTRIBUTE EXTRACTION
    # ---------------------------------------------------------

    def extract_attributes(
        self,
        text: str
    ) -> dict[str, Any]:

        normalized = normalize_product_title(text)

        tokens = self._tokens(text)

        category = self.detect_category(text)

        attributes = {
            "category": category,
            "brand": self.extract_brand(tokens),

            "model": None,

            "storage": None,
            "ram": None,

            "size": None,
            "color": None,

            "material": None,
            "fit": None,

            "shade": None,
            "finish": None,

            "volume": None,
            "quantity": None,

            "product_type": None,

            "identifiers": set()
        }

        # -----------------------------------------------------
        # STORAGE
        # -----------------------------------------------------

        storage_match = re.search(
            r"\b(\d+(?:\.\d+)?)\s?(gb|tb)\b",
            normalized
        )

        if storage_match:

            attributes["storage"] = (
                storage_match.group(1)
                + storage_match.group(2)
            )

        # -----------------------------------------------------
        # RAM
        # -----------------------------------------------------

        ram_match = re.search(
            r"\b(\d+(?:\.\d+)?)\s?gb\s?ram\b",
            normalized
        )

        if ram_match:

            attributes["ram"] = (
                ram_match.group(1)
                + "gb"
            )

        # -----------------------------------------------------
        # SIZE
        # -----------------------------------------------------

        size_patterns = [

            r"\bsize\s*([a-z0-9]+)\b",

            r"\b(\d+(?:\.\d+)?)\s?(?:inch|in)\b",

        ]

        for pattern in size_patterns:

            match = re.search(
                pattern,
                normalized
            )

            if match:

                attributes["size"] = match.group(1)

                break

        # -----------------------------------------------------
        # COLORS
        # -----------------------------------------------------

        for color in self.COLORS:

            if re.search(
                rf"\b{re.escape(color)}\b",
                normalized
            ):

                attributes["color"] = color

                break

        # -----------------------------------------------------
        # MATERIAL
        # -----------------------------------------------------

        for material in self.MATERIALS:

            if re.search(
                rf"\b{re.escape(material)}\b",
                normalized
            ):

                attributes["material"] = material

                break

        # -----------------------------------------------------
        # FIT
        # -----------------------------------------------------

        for fit in self.FITS:

            if re.search(
                rf"\b{re.escape(fit)}\b",
                normalized
            ):

                attributes["fit"] = fit

                break

        # -----------------------------------------------------
        # FINISH
        # -----------------------------------------------------

        for finish in self.FINISHES:

            if re.search(
                rf"\b{re.escape(finish)}\b",
                normalized
            ):

                attributes["finish"] = finish

                break

        # -----------------------------------------------------
        # VOLUME
        # -----------------------------------------------------

        volume_match = re.search(
            r"\b(\d+(?:\.\d+)?)\s?(ml|l|oz)\b",
            normalized
        )

        if volume_match:

            attributes["volume"] = (
                volume_match.group(1)
                + volume_match.group(2)
            )

        # -----------------------------------------------------
        # QUANTITY
        # -----------------------------------------------------

        quantity_match = re.search(
            r"\b(?:pack|set|set of)\s?(\d+)\b",
            normalized
        )

        if quantity_match:

            attributes["quantity"] = quantity_match.group(1)

        # -----------------------------------------------------
        # BEAUTY SHADE
        # -----------------------------------------------------

        shade_match = re.search(
            r"\b(?:shade|color|colour)\s?([a-z0-9-]+)\b",
            normalized
        )

        if shade_match:

            attributes["shade"] = shade_match.group(1)

        # -----------------------------------------------------
        # PRODUCT TYPE
        # -----------------------------------------------------

        for category, keywords in self.CATEGORY_KEYWORDS.items():

            for keyword in keywords:

                if keyword in tokens:

                    attributes["product_type"] = keyword

                    break

            if attributes["product_type"]:
                break

        # -----------------------------------------------------
        # MODEL IDENTIFIERS
        # -----------------------------------------------------

        ignored = {
            "the",
            "new",
            "with",
            "for",
            "and",
            "original",
            "official",
            "sale",
            "free",
            "shipping",
            "unlocked",
            "edition",
            "global",
            "international",
            "women",
            "men",
            "unisex"
        }

        identifiers = set()

        for token in tokens:

            if token in ignored:
                continue

            if token in self.COLORS:
                continue

            if token in self.MATERIALS:
                continue

            if token in self.FITS:
                continue

            if token in self.FINISHES:
                continue

            if token in self.COMMON_BRANDS:
                continue

            if token in self.CATEGORY_KEYWORDS.get(
                category,
                set()
            ):
                continue

            identifiers.add(token)

        attributes["identifiers"] = identifiers

        # -----------------------------------------------------
        # MODEL
        # -----------------------------------------------------

        if identifiers:

            attributes["model"] = " ".join(
                sorted(identifiers)
            )

        return attributes

    # ---------------------------------------------------------
    # TF-IDF SIMILARITY
    # ---------------------------------------------------------

    def tfidf_similarity(
        self,
        query: str,
        product_title: str
    ) -> float:

        query_text = normalize_product_title(query)

        product_text = normalize_product_title(
            product_title
        )

        if not query_text or not product_text:
            return 0.0

        vectors = self.vectorizer.fit_transform(
            [
                query_text,
                product_text
            ]
        )

        similarity = cosine_similarity(
            vectors[0:1],
            vectors[1:2]
        )[0][0]

        return round(
            float(similarity),
            3
        )

    # ---------------------------------------------------------
    # ATTRIBUTE COMPARISON
    # ---------------------------------------------------------

    def compare_attributes(
        self,
        query: dict[str, Any],
        product: dict[str, Any]
    ) -> dict[str, Any]:

        matches = {}

        mismatches = []

        attributes_to_compare = [
            "category",
            "brand",
            "storage",
            "ram",
            "size",
            "color",
            "material",
            "fit",
            "shade",
            "finish",
            "volume",
            "quantity",
            "product_type"
        ]

        for attribute in attributes_to_compare:

            query_value = query.get(attribute)

            product_value = product.get(attribute)

            # Query didn't specify it
            if query_value is None:
                continue

            # Product didn't specify it
            if product_value is None:

                matches[attribute] = "unknown"

                continue

            if (
                str(query_value).lower()
                ==
                str(product_value).lower()
            ):

                matches[attribute] = "match"

            else:

                matches[attribute] = "mismatch"

                mismatches.append({
                    "attribute": attribute,
                    "query_value": query_value,
                    "product_value": product_value
                })

        return {
            "matches": matches,
            "mismatches": mismatches
        }

    # ---------------------------------------------------------
    # IDENTIFIER SIMILARITY
    # ---------------------------------------------------------

    def identifier_similarity(
        self,
        query: dict[str, Any],
        product: dict[str, Any]
    ) -> float:

        query_identifiers = query.get(
            "identifiers",
            set()
        )

        product_identifiers = product.get(
            "identifiers",
            set()
        )

        if not query_identifiers:

            return 0.0

        intersection = (
            query_identifiers
            .intersection(product_identifiers)
        )

        return round(
            len(intersection)
            /
            len(query_identifiers),
            3
        )

    # ---------------------------------------------------------
    # CATEGORY COMPATIBILITY
    # ---------------------------------------------------------

    def category_score(
        self,
        query: dict[str, Any],
        product: dict[str, Any]
    ) -> float:

        query_category = query.get("category")

        product_category = product.get("category")

        if (
            query_category == "generic"
            or product_category == "generic"
        ):

            return 0.5

        if query_category == product_category:

            return 1.0

        return 0.0

    # ---------------------------------------------------------
    # FINAL MATCHING
    # ---------------------------------------------------------

    def match_product(
        self,
        query: str,
        product: dict[str, Any]
    ) -> dict[str, Any]:

        title = product.get(
            "product_title",
            ""
        )

        query_info = self.extract_attributes(
            query
        )

        product_info = self.extract_attributes(
            title
        )

        attribute_result = (
            self.compare_attributes(
                query_info,
                product_info
            )
        )

        identifier_score = (
            self.identifier_similarity(
                query_info,
                product_info
            )
        )

        text_score = self.tfidf_similarity(
            query,
            title
        )

        category_score = self.category_score(
            query_info,
            product_info
        )

        matches = attribute_result[
            "matches"
        ]

        # -----------------------------------------------------
        # BASE SCORE
        # -----------------------------------------------------

        score = 0.0

        # Text similarity works for ALL categories
        score += text_score * 0.30

        # Product identifier overlap
        score += identifier_score * 0.25

        # Category
        score += category_score * 0.15

        # -----------------------------------------------------
        # ATTRIBUTE MATCHES
        # -----------------------------------------------------

        attribute_weights = {

            "brand": 0.08,

            "storage": 0.06,

            "ram": 0.04,

            "size": 0.04,

            "color": 0.03,

            "material": 0.03,

            "fit": 0.02,

            "shade": 0.06,

            "finish": 0.02,

            "volume": 0.04,

            "quantity": 0.02,

            "product_type": 0.06
        }

        for attribute, weight in (
            attribute_weights.items()
        ):

            if matches.get(attribute) == "match":

                score += weight

        # -----------------------------------------------------
        # MISMATCH PENALTIES
        # -----------------------------------------------------

        mismatch_penalties = {

            "category": 0.35,

            "brand": 0.25,

            "storage": 0.20,

            "ram": 0.15,

            "size": 0.15,

            "color": 0.08,

            "material": 0.08,

            "fit": 0.06,

            "shade": 0.15,

            "finish": 0.08,

            "volume": 0.12,

            "quantity": 0.08,

            "product_type": 0.20
        }

        for mismatch in (
            attribute_result["mismatches"]
        ):

            attribute = mismatch["attribute"]

            score -= mismatch_penalties.get(
                attribute,
                0.05
            )

        score = max(
            0.0,
            min(score, 1.0)
        )

        # -----------------------------------------------------
        # MATCH LEVEL
        # -----------------------------------------------------

        if score >= 0.75:

            match_level = "HIGH"

        elif score >= 0.50:

            match_level = "MEDIUM"

        else:

            match_level = "LOW"

        return {

            "product_id": product.get(
                "product_id"
            ),

            "product_title": title,

            "category": query_info[
                "category"
            ],

            "tfidf_similarity": text_score,

            "identifier_similarity":
                identifier_score,

            "category_similarity":
                category_score,

            "attributes": {

                "query": query_info,

                "product": product_info,

                "comparison":
                    attribute_result
            },

            "final_match_score":
                round(score, 3),

            "match_level":
                match_level
        }

    # ---------------------------------------------------------
    # RANK PRODUCTS
    # ---------------------------------------------------------

    def rank_products(
        self,
        query: str,
        products: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:

        results = []

        for product in products:

            match = self.match_product(
                query=query,
                product=product
            )

            results.append({

                "product": product,

                "match": match

            })

        results.sort(
            key=lambda item:
                item["match"][
                    "final_match_score"
                ],
            reverse=True
        )

        return results