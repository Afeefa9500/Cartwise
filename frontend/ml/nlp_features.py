"""Text -> feature strings. server/nlp/tokenize.js is a line-for-line port of this file;
ml/train.py writes a parity fixture and server/nlp-test.js checks that both give identical probabilities."""
import re

TOKEN_RE = re.compile(r"[a-z0-9]+(?:'[a-z]+)?|[.!?,;:()\[\]\"]")
PUNCT = set('.!?,;:()[]"')
NEGATORS = {
    "not", "no", "never", "none", "nothing", "neither", "nor", "cannot", "without", "hardly", "barely", "scarcely",
    "dont", "doesnt", "didnt", "isnt", "wasnt", "cant", "wont", "couldnt", "wouldnt", "shouldnt", "havent", "hasnt",
    "arent", "werent", "aint",
}
CONTRAST = {"but", "however", "although", "though", "yet", "except"}
PASS = {"a", "an", "the", "very", "too", "really", "so", "at", "all", "be", "been", "is", "are", "was", "were",
        "that", "it", "to", "of", "even", "quite", "just", "much", "more", "any"}
WINDOW = 3


def is_negator(w):
    return w in NEGATORS or w.endswith("n't")


def tokens(text):
    """Lower-cased tokens with negation scope tagged as 'not_<word>'. Returns list of (token, base_word_or_None, negated)."""
    t = str(text).lower().replace("’", "'")
    out, left = [], 0
    for m in TOKEN_RE.finditer(t):
        w = m.group()
        if w in PUNCT:
            left = 0
            out.append((w, None, False))
            continue
        if w in CONTRAST:
            left = 0
            out.append((w, w, False))
            continue
        if is_negator(w):
            left = WINDOW
            out.append((w, w, False))
            continue
        if left > 0 and w not in PASS:
            left -= 1
            out.append(("not_" + w, w, True))
        else:
            out.append((w, w, False))
    return out


def features(text, lex_pos, lex_neg, vader=None):
    """vader: optional {word: -2|-1|1|2} valence bins (|v|>=2 -> 2). Negation flips the sign."""
    feats, prev = [], None
    for tok, base, neg in tokens(text):
        if base is None:  # punctuation ends a bigram window
            prev = None
            continue
        feats.append(tok)
        if prev is not None:
            feats.append(prev + "_" + tok)
        prev = tok
        if base in lex_pos:
            feats.append("__LN__" if neg else "__LP__")
        elif base in lex_neg:
            feats.append("__LP__" if neg else "__LN__")
        if vader and base in vader:
            v = -vader[base] if neg else vader[base]
            feats.append("__V%s%d__" % ("P" if v > 0 else "N", abs(v)))
    return feats
