"""Downloads the public datasets used to train the review-sentiment model into ml/data/raw.
Run once:  python ml/fetch_data.py        (needs internet access to raw.githubusercontent.com)

Sources
  * Hu & Liu (2004) annotated customer reviews of 14 electronics products + opinion lexicon (CC BY 4.0),
    distributed in the NLTK data repository.
  * Tackstrom & McDonald (2011) fine-grained sentence-level sentiment, 294 reviews (books, dvds, electronics, music, games).
  * Pang & Lee (2005) sentence polarity v1.0 (movie snippets) - only used if it improves held-out accuracy.
"""
import io
import pathlib
import urllib.request
import zipfile

RAW = pathlib.Path(__file__).parent / "data" / "raw"
NLTK = "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/{}.zip"
FILES = {
    "finegrained.txt": "https://raw.githubusercontent.com/oscartackstrom/sentence-sentiment-data/master/data/finegrained.txt",
}
ZIPS = ["product_reviews_1", "product_reviews_2", "opinion_lexicon", "sentence_polarity"]


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    for z in ZIPS:
        print("downloading", z)
        zipfile.ZipFile(io.BytesIO(get(NLTK.format(z)))).extractall(RAW)
    for name, url in FILES.items():
        print("downloading", name)
        (RAW / name).write_bytes(get(url))
    print("done ->", RAW)


if __name__ == "__main__":
    main()
