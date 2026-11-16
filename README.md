# CartWise — deployable project

CartWise keeps the existing React/Vite storefront and Express account/cart services, and adds a FastAPI live-product-search service. RapidAPI credentials are used only by FastAPI; the browser never receives the key.

## What's connected

- Existing storefront, account pages, sign-in/sign-up, cart, wishlist, Review AI and assistant UI are retained from the supplied `cartwise_fixed.zip`.
- Search submissions now use the live FastAPI `/api/search` route through the Express `/api/live/search` proxy. Search cards display provider-returned title, image, price, store, rating, review count, discount and listing URL.
- Live USD prices and original prices are converted to approximate INR for display and ranking using a clearly disclosed indicative rate of ₹94.12 per USD (16 Nov 2026). The source remains US listings, not Indian marketplace offers; taxes, shipping, import duties and bank/card conversion margins may differ. Non-USD currencies are left in their source currency.
- FastAPI caches responses in SQLite across restarts and counts uncached provider requests by calendar month. With a configured 100-call limit and 10-call reserve, it stops at 90 calls. Cache hits do not consume provider quota.
- Product Details, Product Offers, Product Reviews, Price History and Deals service modules remain available in the Python backend. They are not automatically called for every search result. Store Details is excluded.

## Important scope / honest limitations

- The supplied frontend's home/category catalogue and its existing product-detail demo screens still use the original local demo dataset. The live integration is the search-results flow; a live search result opens its source listing. It does not silently mix the synthetic catalogue with provider results.
- Your supplied Deals sample returned `data.reviews: []`, not deal objects. Deals are therefore not used in the live search flow.
- Your supplied Product Details and Product Offers samples appeared to overlap, and the Product Reviews sample also included price-history information nested in an offer. The project does not automatically fan out into all endpoints. Trigger optional enrichment only when the exact endpoint response/schema has been confirmed.
- Your samples used `gl=us`/US listings. This build defaults to `SEARCH_COUNTRY=us`; it does not promise Indian marketplace coverage. Set `SEARCH_COUNTRY=in` only if the RapidAPI endpoint and subscription support it. USD display values are converted using the disclosed indicative rate in `frontend/src/App.jsx`; update `USD_TO_INR_RATE` when refreshing the reference rate.
- Live RapidAPI calls were not made while assembling this package, to protect your 100-call monthly allowance. You must add your own key and run one controlled test.
- The existing cart/auth server was retained. Its original static product validation remains designed around the demo catalogue; live search cards therefore link out to the merchant rather than claiming that a provider product can be added to the account-backed cart.

## Requirements

- Node.js 20+
- Python 3.11 or 3.12 (64-bit)
- A RapidAPI subscription for the product-search API

## Local setup (Windows PowerShell)

### 1. FastAPI backend

```powershell
cd backend
py -3.12 -m venv .venv  # use py -3.11 if that is the version installed
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `backend/.env` and set `RAPIDAPI_KEY`. Keep `RAPIDAPI_HOST` exactly as shown in the RapidAPI subscription page. Start it:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health: http://127.0.0.1:8000/health
API docs: http://127.0.0.1:8000/docs
Quota monitor (does not call RapidAPI): http://127.0.0.1:8000/api/usage

### 2. React + Express app

Open a second terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open http://localhost:5173. Search a product. The Vite app proxies `/api` to Express (port 3001); Express proxies `/api/live/search` to FastAPI (port 8000).

For production build:

```powershell
npm run build
npm start
```

The Express server serves the built React app and keeps account/cart routes active.

## Deployment (two services)

### Service A — FastAPI on Render

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment variables: `RAPIDAPI_KEY`, `RAPIDAPI_HOST`, `RAPIDAPI_MONTHLY_LIMIT=100`, `RAPIDAPI_RESERVE_CALLS=10`, `SEARCH_COUNTRY=us`, `SEARCH_LANGUAGE=en`.
- Attach a persistent disk and set `CACHE_DB_PATH` to a path on that disk (for example `/var/data/cartwise_cache.sqlite3`) so the cache and usage ledger survive deploys/restarts.

### Service B — Express + Vite frontend on Render

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Start command: `node server/index.js`
- Environment variable: `CARTWISE_PYTHON_API_URL=https://YOUR-FASTAPI-SERVICE.onrender.com`
- Add `NODE_ENV=production`.
- The Express JSON persistence file is local to the service. For durable user accounts/cart data on Render, attach a persistent disk and set the app's data path according to `server/db.js`; otherwise data may reset on redeploy/restart.

Use HTTPS URLs for both services. Do not expose `RAPIDAPI_KEY` as a `VITE_*` variable or commit `.env` files.

## Quota strategy

1. Search is the only automatic RapidAPI call in the current live user journey.
2. Exact endpoint+parameter responses are cached in SQLite for six hours for search, 24 hours for details/reviews/price history, and two hours for offers/deals.
3. The monthly usage ledger counts provider attempts after cache lookup. Cache hits are free.
4. A hard guard stops at `limit - reserve` (90 by default). `/api/usage` shows month, calls, reserve and remaining permitted calls.
5. Details/reviews/offers/price history should be fetched only when the user opens the relevant feature and only if the cached parent response does not already contain that information.

## API routes

- `GET /api/search?q=...&limit=20` — FastAPI live product search
- `GET /api/product/{product_id}` — product details
- `GET /api/offers/{product_id}` — product offers
- `GET /api/reviews/{product_id}` — product reviews plus review analysis
- `GET /api/price-history/{product_id}` — product price history (on demand)
- `GET /api/deals?q=...` — deals endpoint (provider response must be validated)
- `GET /api/usage` — local quota ledger; no provider call
- `GET /health` — health check

The browser uses `GET /api/live/search?q=...` on Express, which proxies to FastAPI.

## Troubleshooting

- `CONFIG_ERROR`: `RAPIDAPI_KEY` is missing or blank in `backend/.env`. Create it from `backend/.env.example`, enter your own key, then restart FastAPI. The backend now resolves `.env` relative to `backend/app/config.py`, so the launch directory does not affect loading.
- `AUTH_ERROR`: check RapidAPI key and host spelling.
- `QUOTA_GUARD`: CartWise reached its local 90-call budget; cached responses remain available.
- `QUOTA_EXCEEDED`: RapidAPI itself returned 429; inspect your provider plan/period.
- `BACKEND_UNAVAILABLE`: FastAPI is not running or `CARTWISE_PYTHON_API_URL` is wrong.
- No products: inspect the provider's status and `data.products`; no synthetic fallback is returned.

## Project layout

```text
CartWise/
  backend/       FastAPI + RapidAPI client + persistent SQLite cache/quota ledger
  frontend/      React/Vite UI + Express auth/cart API and FastAPI proxy
  README.md
```

## Live search ranking

Live search now presents a CartWise Top 3 section and a sort control for recommended deals, CartWise score, review signals, price ascending/descending, top rated, and most reviewed. The current score is a transparent heuristic using the listing price, aggregate rating, review-count confidence, and provider discount field. It is not a trained ML prediction. The review-signal sort uses aggregate rating plus review volume; it does not fetch review text for every result (which would consume many API calls). Full review-text sentiment remains a separate product-review analysis workflow.

USD live prices are displayed in approximate INR using the disclosed reference rate; non-USD currencies remain in their source currency. The original API response is not modified. Products are not treated as identical variants unless source data is sufficient to establish that match.
