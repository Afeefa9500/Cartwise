"""Trains the CartWise review-sentiment model and exports it for the Node server.

    pip install -r ml/requirements.txt
    python ml/fetch_data.py       # once
    python ml/train.py            # evaluates several models, writes server/nlp/model.json + ml/REPORT.md

Model: TF-IDF over word uni/bi-grams (with negation tagging and opinion-lexicon features) + logistic regression.
The Node server only needs the exported JSON, no Python at run time.
"""
import json
import pathlib
import re
import sys
import time

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, f1_score
from sklearn.model_selection import GroupKFold
from sklearn.naive_bayes import MultinomialNB

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from nlp_features import features  # noqa: E402

HERE = pathlib.Path(__file__).parent
RAW = HERE / "data" / "raw"
OUT = HERE.parent / "server" / "nlp"
SEED = 7


# ---------------------------------------------------------------- data
def load_lexicon():
    def read(p):
        return {l.strip() for l in open(p, encoding="utf-8", errors="ignore") if l.strip() and not l.startswith(";")}
    return read(RAW / "opinion_lexicon/positive-words.txt"), read(RAW / "opinion_lexicon/negative-words.txt")


def load_vader():
    """VADER valence lexicon (Hutto & Gilbert 2014, MIT licence) binned to -2,-1,1,2; words only."""
    out = {}
    for line in open(RAW / "vader" / "vader_lexicon.txt", encoding="utf-8"):
        w, v = line.split("\t")[:2]
        v = float(v)
        if re.fullmatch(r"[a-z][a-z']+", w) and abs(v) >= 0.5:
            out[w] = (2 if v > 0 else -2) if abs(v) >= 2 else (1 if v > 0 else -1)
    return out


def load_hu_liu():
    """Hu & Liu: 'feature[+2],feature[-1]##sentence'. Sentence label = sign of the summed opinion scores; mixed/0 dropped."""
    rows = []
    for d in ("product_reviews_1", "product_reviews_2"):
        for p in sorted((RAW / d).glob("*.txt")):
            if p.name.lower().startswith("readme"):
                continue
            for line in open(p, encoding="utf-8", errors="ignore"):
                if "##" not in line or line.startswith("[t]"):
                    continue
                left, sent = line.split("##", 1)
                scores = [int(x) for x in re.findall(r"\[([+-]\d)\]", left)]
                sent = sent.strip()
                if not scores or len(sent.split()) < 3:
                    continue
                total = sum(scores)
                if total == 0:
                    continue
                rows.append(dict(text=sent, y=int(total > 0), group="hl:" + p.stem, src="hl", domain="electronics"))
    return rows


def load_tackstrom():
    rows, doc, domain = [], None, None
    for line in open(RAW / "finegrained.txt", encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip():
            doc = domain = None
            continue
        if doc is None:
            doc = line.strip()
            continue
        if domain is None and "\t" in line and line.split("\t")[1].isdigit():
            domain = line.split("\t")[0]
            continue
        lab, _, sent = line.partition("\t")
        if lab in ("pos", "neg") and len(sent.split()) >= 3:
            rows.append(dict(text=sent.strip(), y=int(lab == "pos"), group="tk:" + doc, src="tk", domain=domain))
    return rows


def load_pang_lee():
    rows = []
    for lab, f in ((1, "rt-polarity.pos"), (0, "rt-polarity.neg")):
        for i, line in enumerate(open(RAW / "sentence_polarity" / f, encoding="latin-1")):
            rows.append(dict(text=line.strip(), y=lab, group="pl:%d" % (i // 50), src="pl", domain="movies"))
    return rows


def load_seed():
    rows = []
    for i, line in enumerate(open(HERE / "seed_reviews.tsv", encoding="utf-8")):
        if i == 0:
            continue
        lab, text = line.rstrip("\n").split("\t", 1)
        rows.append(dict(text=text, y=int(lab == "pos"), group="seed:%d" % (i // 10), src="seed", domain="shopping"))
    return rows


# ---------------------------------------------------------------- models
VADER = {}


def make_analyzer(pos, neg, use_lex=True, use_vader=False):
    def analyzer(text):
        f = features(text, pos, neg, VADER if use_vader else None)
        return f if use_lex else [x for x in f if not x.startswith("__L")]
    return analyzer


def lexicon_predict(texts, pos, neg):
    out = []
    for t in texts:
        f = features(t, pos, neg)
        s = f.count("__LP__") - f.count("__LN__")
        out.append(1 if s >= 0 else 0)
    return np.array(out)


def build(kind, pos, neg, C=3.0):
    if kind == "nb":
        vec = CountVectorizer(analyzer=make_analyzer(pos, neg, False), min_df=1)
        return vec, MultinomialNB(alpha=0.5)
    use_lex = kind.startswith("lr+lex")
    vec = TfidfVectorizer(analyzer=make_analyzer(pos, neg, use_lex, kind.endswith("+vader")), min_df=2, sublinear_tf=True, norm="l2")
    return vec, LogisticRegression(C=C, max_iter=2000, class_weight="balanced", solver="liblinear")


def fit_predict(kind, train, test, pos, neg, C=3.0):
    if kind == "lexicon":
        return lexicon_predict([r["text"] for r in test], pos, neg), None
    vec, clf = build(kind, pos, neg, C)
    Xtr = vec.fit_transform([r["text"] for r in train])
    clf.fit(Xtr, [r["y"] for r in train])
    Xte = vec.transform([r["text"] for r in test])
    return clf.predict(Xte), clf.predict_proba(Xte)[:, 1]


def score(test, pred, proba=None):
    y = [r["y"] for r in test]
    r = dict(n=len(y), acc=round(accuracy_score(y, pred), 4), f1=round(f1_score(y, pred, average="macro"), 4))
    if proba is not None:
        r["brier"] = round(brier_score_loss(y, proba), 4)
    return r


# ---------------------------------------------------------------- main
def main():
    t0 = time.time()
    pos, neg = load_lexicon()
    VADER.update(load_vader())
    hl, tk, pl, seed = load_hu_liu(), load_tackstrom(), load_pang_lee(), load_seed()
    tk_elec = [r for r in tk if r["domain"] == "electronics"]
    print(f"Hu&Liu {len(hl)} | Tackstrom {len(tk)} (electronics {len(tk_elec)}) | Pang&Lee {len(pl)} | seed {len(seed)}")
    pct = lambda rows: round(100 * np.mean([r["y"] for r in rows]), 1)
    print(f"positive share: hl {pct(hl)}%  tk {pct(tk)}%  seed {pct(seed)}%")

    configs = [("lexicon", None, []), ("nb", None, seed), ("lr", 3.0, seed), ("lr+lex", 0.5, seed), ("lr+lex", 1.0, seed),
               ("lr+lex", 3.0, seed), ("lr+lex+vader", 1.0, seed), ("lr+lex+vader", 3.0, seed), ("lr+lex+vader", 10.0, seed),
               ("lr+lex+vader", 3.0, seed + pl)]
    results = []
    for kind, C, extra in configs:
        name = kind + ("" if C is None else f" C={C}") + (" +movies" if extra is not seed and extra else "")
        r = {}
        # 1) train on Hu&Liu (+extras), test on a different dataset: Tackstrom (all domains / electronics only)
        p, pr = fit_predict(kind, hl + extra, tk, pos, neg, C or 1)
        r["hl->tk_all"] = score(tk, p, pr)
        p, pr = fit_predict(kind, hl + extra, tk_elec, pos, neg, C or 1)
        r["hl->tk_elec"] = score(tk_elec, p, pr)
        # 2) train on Tackstrom (+extras), test on Hu&Liu
        p, pr = fit_predict(kind, tk + extra, hl, pos, neg, C or 1)
        r["tk->hl"] = score(hl, p, pr)
        # 3) grouped 5-fold CV on the pooled real data (sentences of one review/product never split across folds)
        pool = hl + tk
        groups = [r_["group"] for r_ in pool]
        accs, f1s = [], []
        for tr, te in GroupKFold(n_splits=5).split(pool, groups=groups):
            trn, tst = [pool[i] for i in tr], [pool[i] for i in te]
            p, _ = fit_predict(kind, trn + extra, tst, pos, neg, C or 1)
            s = score(tst, p)
            accs.append(s["acc"]); f1s.append(s["f1"])
        r["cv5"] = dict(acc=round(float(np.mean(accs)), 4), f1=round(float(np.mean(f1s)), 4), sd=round(float(np.std(accs)), 4))
        r["mean_acc"] = round(float(np.mean([r["hl->tk_all"]["acc"], r["hl->tk_elec"]["acc"], r["tk->hl"]["acc"], r["cv5"]["acc"]])), 4)
        results.append(dict(name=name, kind=kind, C=C, with_movies=(extra is not seed and bool(extra)), **r))
        print(f"{name:24s} hl->tk {r['hl->tk_all']['acc']:.3f}  hl->tk_elec {r['hl->tk_elec']['acc']:.3f}  tk->hl {r['tk->hl']['acc']:.3f}  cv5 {r['cv5']['acc']:.3f}±{r['cv5']['sd']:.3f}  mean {r['mean_acc']:.3f}")

    # Prefer product-domain data: the movie-snippet variant is only chosen if it clearly helps on electronics reviews.
    learned = [r for r in results if r["kind"] not in ("lexicon", "nb")]
    best = max([r for r in learned if not r["with_movies"]], key=lambda r: r["mean_acc"])
    for r in learned:
        if r["with_movies"] and r["kind"] == best["kind"] and r["hl->tk_elec"]["acc"] >= best["hl->tk_elec"]["acc"] + 0.01:
            best = r
    print("\nselected:", best["name"])

    # ---- final model: everything real + seed (+ movies only if it won)
    final_rows = hl + tk + seed + (pl if best["with_movies"] else [])
    vec, clf = build(best["kind"], pos, neg, best["C"])
    X = vec.fit_transform([r["text"] for r in final_rows])
    clf.fit(X, [r["y"] for r in final_rows])
    vocab = vec.vocabulary_
    order = sorted(vocab, key=lambda k: vocab[k])
    coef = clf.coef_[0]
    model = dict(
        version=1, kind=best["kind"], C=best["C"],
        trained_on=dict(hu_liu=len(hl), tackstrom=len(tk), seed=len(seed), pang_lee=len(pl) if best["with_movies"] else 0),
        thresholds=dict(neg=0.40, pos=0.60),
        intercept=round(float(clf.intercept_[0]), 6),
        vocab=order,
        idf=[round(float(x), 5) for x in vec.idf_],
        coef=[round(float(x), 5) for x in coef],
        lex_pos=sorted(pos), lex_neg=sorted(neg),
        vader={str(b): sorted(w for w, v in VADER.items() if v == b) for b in (-2, -1, 1, 2)} if best["kind"].endswith("+vader") else None,
        metrics=dict(selected=best["name"], hl_to_tk_all=best["hl->tk_all"], hl_to_tk_electronics=best["hl->tk_elec"],
                     tk_to_hl=best["tk->hl"], cv5=best["cv5"]),
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "model.json").write_text(json.dumps(model, separators=(",", ":")))
    print("model.json:", round((OUT / "model.json").stat().st_size / 1024), "KB,", len(order), "features")

    # ---- parity fixture so the JS port can be checked against sklearn
    probe = [r["text"] for r in (tk_elec[:12] + hl[:12] + seed[::18] + pl[:4])] + [
        "Not good at all, I wouldn't buy it again.", "Battery life is great but the screen is dim.", "It isn't bad.",
        "WORST. PURCHASE. EVER!!!", "okay product, does the job", "Delivery was late; however the quality is excellent.", "",
    ]
    Xp = vec.transform(probe)
    probs = clf.predict_proba(Xp)[:, 1]
    (OUT / "parity.json").write_text(json.dumps([dict(text=t, p=round(float(p), 6)) for t, p in zip(probe, probs)], indent=1))

    # ---- most influential features (sanity check + report)
    idx = np.argsort(coef)
    top_neg = [order[i] for i in idx[:15]]
    top_pos = [order[i] for i in idx[::-1][:15]]
    write_report(results, best, model, top_pos, top_neg, time.time() - t0)


def write_report(results, best, model, top_pos, top_neg, secs):
    L = ["# CartWise review-sentiment model: training report", "",
         "Generated by `python ml/train.py`. Every number below is measured on **real, human-labelled** review sentences",
         "that the model did not train on (cross-dataset tests) or on whole held-out reviews (grouped CV).", "",
         "## Data", "",
         "| Source | Sentences used | Notes |", "| --- | --- | --- |",
         f"| Hu & Liu (2004) customer reviews | {model['trained_on']['hu_liu']} | 14 electronics products, sentence label = sign of annotated feature opinions |",
         f"| Täckström & McDonald (2011) | {model['trained_on']['tackstrom']} | pos/neg sentences, books/dvds/electronics/music/games |",
         f"| Hand-written shopping examples | {model['trained_on']['seed']} | delivery, packaging, fit, fabric, skin feel, seller, refunds (`ml/seed_reviews.tsv`) |",
         f"| Pang & Lee (2005) movie snippets | {model['trained_on']['pang_lee']} | {'used' if model['trained_on']['pang_lee'] else 'tested, did not help held-out accuracy, so not used'} |", "",
         "## Model comparison (accuracy / macro-F1)", "",
         "| Model | Train HL → test Täckström (all) | Train HL → test Täckström (electronics) | Train Täckström → test HL | Grouped 5-fold CV |", "| --- | --- | --- | --- | --- |"]
    for r in results:
        mark = " **(selected)**" if r["name"] == best["name"] else ""
        L.append(f"| {r['name']}{mark} | {r['hl->tk_all']['acc']:.3f} / {r['hl->tk_all']['f1']:.3f} | {r['hl->tk_elec']['acc']:.3f} / {r['hl->tk_elec']['f1']:.3f} | {r['tk->hl']['acc']:.3f} / {r['tk->hl']['f1']:.3f} | {r['cv5']['acc']:.3f} ± {r['cv5']['sd']:.3f} |")
    L += ["", "`lexicon` = count of Hu & Liu opinion words with negation (no learning). `nb` = multinomial Naive Bayes.",
          "`lr` / `lr+lex` / `lr+lex+vader` = TF-IDF logistic regression without lexicon features / with the Hu & Liu opinion lexicon / plus the VADER valence lexicon.", "",
          "## Strongest learned features", "",
          "Positive: " + ", ".join(f"`{x}`" for x in top_pos), "", "Negative: " + ", ".join(f"`{x}`" for x in top_neg), "",
          "## Limits", "",
          "* Binary (positive / negative). Probabilities between 0.40 and 0.60 are reported as *mixed / neutral* by the app.",
          "* Training data is English product reviews (mostly electronics) plus a small hand-written shopping set; accuracy on fashion, beauty or Hinglish text will be lower than the electronics numbers above.",
          "* Sarcasm and long multi-topic reviews are hard; the app therefore scores sentence by sentence.",
          f"* Trained in {secs:.0f}s.", ""]
    (HERE / "REPORT.md").write_text("\n".join(L))
    print("wrote ml/REPORT.md")


if __name__ == "__main__":
    main()
