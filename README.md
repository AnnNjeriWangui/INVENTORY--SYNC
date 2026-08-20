# Northstar Retail Co. - Live Inventory Sync Service (Sprint 2)

An enterprise-grade, resilient live inventory sync service built for **Northstar Retail Co.** customer support and operations tools. This system ensures customer support agents receive real-time, accurate stock availability ("Is this in stock?") across all distribution hubs, even during supplier API outages, network degradation, or rate limits.

---

## 🌟 Key Features

1. **Support Agent Instant Stock Lookup ("Is this in stock?")**:
   - Query stock counts by SKU, product name, category, or warehouse location.
   - Real-time stock status breakdown (`In Stock`, `Low Stock`, `Out of Stock`) and reserved inventory tracking.

2. **Resilient Retry & Exponential Backoff Engine**:
   - **Exponential Backoff**: Configurable multiplier ($delay = base \times factor^{(attempt-1)}$).
   - **Jitter Strategies**: Supports **Full Jitter** (random uniform range $[0, capped\_delay]$) and **Equal Jitter** to prevent thundering herd spikes on supplier APIs.
   - **Configurable Controls**: Dynamic max retries (1–6), base delay (100ms–2000ms), and max delay caps.
   - **Transient Error Filtering**: Automatic retry triggers for `408`, `429 Rate Limit`, `500`, `502`, `503 Service Unavailable`, `504 Gateway Timeout`, and socket drops.

3. **Live Fault & Latency Simulator**:
   - In-app simulator to test system resilience against simulated HTTP 503 errors, 429 rate limits, 50% flaky connections, and high network latency.

4. **Real-Time Telemetry & Log Console**:
   - Live stream of API attempt events, backoff wait durations, retry counters, and HTTP status codes.

5. **Vercel Serverless & Static Ready**:
   - Serverless Python functions in `/api` (`api/inventory.py`, `api/sync.py`, `api/health.py`).
   - Configured via `vercel.json` for static hosting and Python serverless runtimes.

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
