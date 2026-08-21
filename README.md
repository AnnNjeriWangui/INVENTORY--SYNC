# Northstar Retail Co. - Live Inventory Sync Service (Sprint 2)

An enterprise-grade, resilient live inventory sync service built for **Northstar Retail Co.** customer support and operations tools. This system ensures customer support agents receive real-time, accurate stock availability ("Is this in stock?") across all distribution hubs, even during supplier API outages, network degradation, or rate limits.

---

## 🌟 Key Features

1. **Support Agent Instant Stock Lookup ("Is this in stock?")**:
   - Query stock counts by SKU, product name, category, or warehouse location.
   - Real-time stock status breakdown (`In Stock`, `Low Stock`, `Out of Stock`) and reserved inventory tracking.

2. **5-Minute Warehouse Polling & Graceful Degradation**:
   - Automated background polling querying the mock warehouse API every 5 minutes (`300_000ms`).
   - Retains last-good cached stock data during transient API drops to ensure zero downtime for support agents.

3. **In-Memory Local Caching Layer (`StockCache`)**:
   - Per-entry TTL caching (`360_000ms` / 6 minutes) preventing redundant supplier network roundtrips.
   - Cache hit/miss analytics, cache age reporting, and explicit cache invalidation mechanisms.

4. **Real-Time Dashboard Query Function (`getStockAvailability`)**:
   - Cache-aside lookup endpoint serving instant queries by SKU, name, category, and regional hub.
   - Rich query metadata (`found`, `cacheHit`, `cacheAge`, `lastPolled`, `pollingActive`).

5. **Resilient Retry & Exponential Backoff Engine (Under the Hood)**:
   - **Exponential Backoff**: Configurable multiplier ($delay = base \times factor^{(attempt-1)}$).
   - **Jitter Strategies**: Supports **Full Jitter** (random uniform range $[0, capped\_delay]$) and **Equal Jitter** to prevent thundering herd spikes on supplier APIs.
   - **Automatic Resilience**: Production defaults (`maxRetries: 3`, `baseDelay: 500ms`, `jitterMode: 'full'`) running in the background without UI clutter.
   - **Transient Error Filtering**: Automatic retry triggers for `408`, `429 Rate Limit`, `500`, `502`, `503 Service Unavailable`, `504 Gateway Timeout`, and socket drops.

6. **Customer-Facing Sync Status & State Machine**:
   - Explicit 5-state UI state machine (`idle`, `syncing`, `retrying`, `success`, `failed`).
   - Dynamic 4-state Customer Sync Banner (CSB) with animated backoff countdown progress bar and per-card status badges.
   - Graceful degradation snapshot fallback with single-click retry action.

7. **Learning & Blocker Journal**:
   - Comprehensive technical documentation in `LEARNING_JOURNAL.md` covering consulted resources, error logs, and autonomous blocker resolutions.

8. **Vercel Serverless & Static Ready**:
   - Serverless Python functions in `/api` and root `index.py`.
   - Configured via `vercel.json` for zero-config static hosting and Python serverless runtimes.

6. **Design Aesthetic**:
   - Primary Theme: **Sage Green** (`#7D9D84` / `#4E6E58`), **Slate Blue** (`#2C3E50` / `#475569`), and **Espresso Brown** (`#3D2314` / `#4A2E1B`).

---

## 🛠️ Project Structure

```
INVENTORY--SYNC/
├── api/
│   ├── retry_engine.py      # Core Python exponential backoff & jitter logic
│   ├── inventory.py         # Vercel Serverless Function: stock queries & lookups
│   ├── sync.py              # Vercel Serverless Function: batch inventory sync
│   └── health.py            # Vercel Serverless Function: service health status
├── js/
│   ├── retry-backoff.js     # Client-side Exponential Backoff & Retry class
│   ├── api-client.js        # API Client wrapper with fault simulation hooks
│   ├── sync-service.js      # Live sync state machine & differential reconciliation
│   └── app.js               # Main UI controller & telemetry streaming logger
├── tests/
│   └── test_retry.py        # Python unit tests for backoff calculation & retries
├── index.html               # Main support agent SPA dashboard
├── styles.css               # Design system stylesheet (Sage Green, Slate Blue, Espresso)
├── vercel.json              # Vercel deployment routes & serverless config
├── package.json             # NPM metadata and scripts
├── requirements.txt         # Python dependencies
└── README.md                # System documentation
```

---

## 🚀 Running Locally

### 1. Run Local Dev Server
```bash
python -m http.server 3000
```
Open `http://localhost:3000` in your web browser.

### 2. Run Unit Tests
```bash
python -m unittest discover -s tests
```

---

## ☁️ Deploying to Vercel

1. Push code to GitHub repository: `https://github.com/AnnNjeriWangui/INVENTORY--SYNC.git`.
2. Connect repository to [Vercel](https://vercel.com).
3. Vercel automatically detects `vercel.json` and deploys static assets with Python serverless endpoints in `/api`.

---

## 📄 License & Client Notice
Confidential & Proprietary to **Northstar Retail Co.** (Sprint 2 Delivery).
