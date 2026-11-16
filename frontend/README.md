# CartWise ⚡ – Shop Smarter. Decide Better.

Compare Amazon, Flipkart and Meesho offers for 350 products, get a price + reviews recommendation, and keep a
cart, wishlist and order history in a real account. Front end: React + Vite. Back end: Node + Express.

## Run it (Windows Command Prompt or any terminal)

1. Install Node.js LTS from https://nodejs.org (version 18 or newer).
2. In this folder:

       npm install
       npm run dev

   This starts the API on http://localhost:3001 and the website on http://localhost:5173 (opens automatically).

**Single-server mode** (what you would deploy): `npm start` builds the site and serves website + API together
on http://localhost:3001.

**Check everything works:** `npm test` runs 11 NLP checks, then starts a throw-away server and runs 33 end-to-end checks.
`npm run eval` measures the review-analysis pipeline (see below).

## What the back end does

| Area | Details |
| --- | --- |
| Sign up / sign in / sign out | Passwords hashed with scrypt (never stored in clear). Sessions are random tokens in an HttpOnly, SameSite cookie; only a hash of the token is stored. "Keep me signed in" = 30 days, otherwise 1 day. |
| Brute-force protection | 5 wrong passwords lock that email for 30 s (countdown shown). Per-IP limits on sign in, sign up, reset and email checks. Unknown email and wrong password look identical. |
| Forgot / reset password | 6-digit code, valid 10 minutes, single use, 5 tries. A reset signs out every device. |
| Account | Edit profile, change password (signs out other devices), delete account (needs password). |
| Cart, wishlist, orders | Stored per account on the server, so they follow you to any device. "Place order" is calculated on the server from its own prices, never from numbers sent by the browser. Guest cart/wishlist merge into the account on sign in. |
| Live updates | The browser keeps a Server-Sent Events connection open. Add to cart, place an order, sign out or change your password on one tab/device and every other open tab/device updates within a moment. Expired or revoked sessions sign you out live. |
| Security basics | CSRF protection (Origin check + SameSite cookies), CSP and other security headers, request size limit, input validation on every endpoint. |

API summary (all under `/api`): `GET /health`, `GET /auth/me`, `GET /auth/email-available`, `POST /auth/signup`,
`POST /auth/signin`, `POST /auth/signout`, `POST /auth/forgot`, `POST /auth/reset`, `PATCH /account`,
`POST /account/password`, `DELETE /account`, `GET /state`, `POST /cart/items`, `PUT /cart/items/:id`,
`PUT|DELETE /wishlist/:id`, `POST /merge`, `POST /orders`, `GET /events`.

## AI: review analysis and shopping assistant

**Review analysis (ML + NLP).** Every product page has a *Review analysis* section, and every product card shows the share of
positive / negative reviews. Pipeline (`server/nlp/`, `server/insights.js`):

1. Spelling repair for swapped letters, then split each review into sentences and clauses.
2. **Sentiment model**: TF-IDF word + bigram features with negation tagging, the Hu & Liu opinion lexicon and VADER valence
   words, fed into **logistic regression**. It is trained by `ml/train.py` on ~6,000 human-labelled review sentences
   (Hu & Liu 2004, Täckström & McDonald 2011) plus a small hand-written shopping set. Weights are exported to
   `server/nlp/model.json`, so Node needs no Python at run time. Held-out accuracy: 74-82% across datasets, 82% cross-validated
   (details and model comparison in `ml/REPORT.md`).
3. A small rule layer for phrases a bag-of-words model gets wrong ("no lag", "no results", "would buy again", "battery drains fast").
4. **Aspect-based sentiment**: 19 aspects (battery, camera, delivery, fit, ...) are found per clause and scored separately, so
   "great camera but the battery drains fast" gives one opinion per topic.
5. **Quality flags**: stars that contradict the text, one-word reviews, all caps. Flagged reviews count for less.
6. Product score: price position + review quality (stars blended with what the text says, shrunk toward a prior when there
   are few reviews) + review trust.

The **Review AI** page (`#/review-ai`) lets anyone paste a review and watch the model read it. `npm run eval` checks the pipeline
against the opinions the demo-review generator actually wrote. Current results on 8,264 demo reviews: aspect polarity 98.5%,
aspect detection recall 97%, stars-vs-text mismatch flags 98% precision / 80% recall. These come from templated demo text, so
treat them as a regression check; the real-world numbers are the held-out ones in `ml/REPORT.md`.

**Shopping assistant** (floating *Ask CartWise* button). A rule-based language layer (budget ranges like "under 30k" or "between 50k
and 80k", preferences like "great battery", comparisons, ordinals like "the second one", follow-ups like "cheaper") feeds a
ranker that combines price with each product's review analysis. It does not call an external LLM; every claim in a reply comes from
catalogue + review numbers shown on the product page.

Extra API routes (public): `GET /api/products/:id/insights`, `GET /api/products/:id/reviews`, `GET /api/insights/summary`,
`POST /api/analyze`, `POST /api/assistant`, `GET /api/model`.

To retrain: `pip install -r ml/requirements.txt`, `python ml/fetch_data.py` (only if `ml/data/raw` is missing), `python ml/train.py`.

## Project layout

    server/index.js      Express app: security headers, CSRF check, serves dist/ in production
    server/routes.js     All API endpoints and the live-event stream
    server/security.js   Password hashing, cookies, rate limiting
    server/db.js         Database (JSON file at data/db.json, written atomically)
    server/mail.js       Sends the reset code (console or SMTP)
    server/ai-routes.js  Review-analysis and assistant endpoints
    server/assistant.js  Shopping assistant
    server/insights.js   Product-level review intelligence; server/reviews.js = demo review text
    server/nlp/          Sentiment model inference, aspect extraction, rules; model.json is written by ml/train.py
    server/eval.js       Measures the review pipeline (npm run eval)
    server/test.js       End-to-end tests; server/nlp-test.js = NLP unit tests
    ml/                  Training code, datasets, REPORT.md
    src/                 React app (App.jsx, AuthPages.jsx, Insights.jsx = review analysis + assistant UI, api.js, data.js, search.js)
    .env.example         Optional settings (copy to .env)

## Settings (optional, copy `.env.example` to `.env`)

- `PORT` – API port (default 3001; if you change it also change the proxy target in `vite.config.js`).
- `SMTP_URL`, `MAIL_FROM` – turn on real password-reset emails (e.g. `smtps://user:pass@smtp.gmail.com:465`).
  **Without SMTP the code is printed in the server console and shown on the reset page**, so password reset
  works locally. Once SMTP is set, codes are only emailed.
- `COOKIE_SECURE=true` – set when the site is served over https. `TRUST_PROXY=1` – set behind a reverse proxy.
- `DB_FILE` – custom database file location.

## Before real customers use it

- The database is a single JSON file: perfect for development and small deployments on one server. For many users,
  or more than one server instance, swap `server/db.js` for PostgreSQL or MongoDB (the routes only use `db` and `save()`).
- Serve it over https (use a host such as Render, Railway or Fly, or put nginx/Caddy in front) and set `COOKIE_SECURE=true`.
- Product prices, ratings and reviews are still simulated demo data (`src/data.js`); real marketplace prices
  need the stores' official affiliate/product APIs, called from the server. Checkout is a demo: no payment is taken.
- Back up `data/db.json`.
