/**
 * Northstar Retail Co. - Live Inventory Sync Service
 * Sprint 2: Resilient Synchronization Manager
 * Day 3: Warehouse Polling · Local Cache Layer · Dashboard Query Endpoint
 */

// ─────────────────────────────────────────────────────────────────────────────
// Day 3 Spec 2 — Local Caching Layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StockCache — lightweight in-memory cache with per-entry TTL.
 *
 * Each entry stores: { data, cachedAt, ttlMs }
 *
 * Usage:
 *   cache.set('all', items);          // store with default TTL
 *   cache.get('all');                 // returns data or null if expired / missing
 *   cache.invalidate('all');          // force-evict a key
 *   cache.clear();                    // wipe everything
 *   cache.getStats();                 // diagnostic snapshot
 */
export class StockCache {
    /**
     * @param {number} defaultTtlMs  How long a cache entry lives (ms).
     *                               Default: 360_000 ms (6 minutes) — just
     *                               beyond the 5-minute poll interval so that
     *                               stale data is never served for more than
     *                               one missed poll cycle.
     */
    constructor(defaultTtlMs = 360_000) {
        this.defaultTtlMs = defaultTtlMs;
        this._store  = new Map();
        this._hits   = 0;
        this._misses = 0;
    }

    /**
     * Store data under key.
     * @param {string} key
     * @param {*}      data
     * @param {number} [ttlMs]  Override the instance default TTL.
     */
    set(key, data, ttlMs) {
        this._store.set(key, {
            data,
            cachedAt: Date.now(),
            ttlMs: ttlMs ?? this.defaultTtlMs
        });
    }

    /**
     * Retrieve data for key. Returns null if missing or expired.
     * @param {string} key
     * @returns {*|null}
     */
    get(key) {
        const entry = this._store.get(key);
        if (!entry) {
            this._misses++;
            return null;
        }
        const age = Date.now() - entry.cachedAt;
        if (age > entry.ttlMs) {
            // Entry has expired — evict and report miss
            this._store.delete(key);
            this._misses++;
            return null;
        }
        this._hits++;
        return entry.data;
    }

    /**
     * Check if a key has a valid (non-expired) entry without counting as a hit.
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        const entry = this._store.get(key);
        if (!entry) return false;
        return (Date.now() - entry.cachedAt) <= entry.ttlMs;
    }

    /**
     * Returns metadata about a cached entry without triggering a hit/miss count.
     * Useful for the dashboard freshness indicator.
     * @param {string} key
     * @returns {{ cachedAt: number, ageMs: number, ttlMs: number, isValid: boolean } | null}
     */
    meta(key) {
        const entry = this._store.get(key);
        if (!entry) return null;
        const ageMs = Date.now() - entry.cachedAt;
        return {
            cachedAt: entry.cachedAt,
            ageMs,
            ttlMs: entry.ttlMs,
            isValid: ageMs <= entry.ttlMs
        };
    }

    /** Force-evict a single key. */
    invalidate(key) {
        this._store.delete(key);
    }

    /** Wipe all cached entries. */
    clear() {
        this._store.clear();
    }

    /**
     * Diagnostic snapshot for the dashboard's cache status widget.
     * @returns {{ entries: number, hits: number, misses: number, hitRate: string }}
     */
    getStats() {
        const total = this._hits + this._misses;
        return {
            entries: this._store.size,
            hits:    this._hits,
            misses:  this._misses,
            hitRate: total === 0 ? '-' : `${((this._hits / total) * 100).toFixed(1)}%`
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache key constants — centralised so callers never hardcode strings
// ─────────────────────────────────────────────────────────────────────────────
export const CACHE_KEYS = {
    ALL_STOCK:   'stock:all',
    LAST_POLLED: 'meta:lastPolled'
};

// ─────────────────────────────────────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────────────────────────────────────

export class LiveInventorySyncService {
    /**
     * @param {InventoryApiClient} apiClient
     * @param {object}  options
     * @param {number}  [options.syncIntervalMs=15000]               Existing UI-refresh interval
     * @param {number}  [options.warehousePollingIntervalMs=300000]  Day 3: 5-minute warehouse poll
     * @param {number}  [options.cacheTtlMs=360000]                  Day 3: cache TTL (6 min)
     */
    constructor(apiClient, options = {}) {
        this.apiClient = apiClient;

        // ── Existing Sprint 2 sync interval (UI refresh) ──────────────────
        this.syncIntervalMs    = options.syncIntervalMs || 15_000;
        this.isAutoSyncEnabled = true;
        this.syncTimer         = null;

        // ── Day 3 Spec 1 — Warehouse polling ──────────────────────────────
        this.warehousePollingIntervalMs = options.warehousePollingIntervalMs || 300_000; // 5 min
        this.warehousePollingTimer      = null;
        this.lastWarehousePollTime      = null;
        this.isPollingEnabled           = false;

        // ── Day 3 Spec 2 — Local cache ────────────────────────────────────
        this.cache = new StockCache(options.cacheTtlMs || 360_000);

        // ── Sync telemetry state ───────────────────────────────────────────
        this.syncState = {
            status:            'IDLE', // IDLE, SYNCING, SUCCESS, ERROR, PAUSED
            lastSyncTime:      null,
            totalSyncs:        0,
            successfulSyncs:   0,
            failedSyncs:       0,
            retriesTriggered:  0,
            itemsCount:        6,
            // Day 3 additions
            lastWarehousePoll: null,
            cacheHitRate:      '-',
            pollingActive:     false
        };

        this.listeners     = [];
        this.inventoryData = [
            {
                sku:         "NSR-1001",
                name:        "Northstar Summit Waterproof Parka",
                category:    "Outerwear",
                price:       24500,
                total_stock: 42,
                reserved:    5,
                available:   37,
                status:      "In Stock",
                warehouses:  { "Nairobi Hub": 18, "Mombasa Hub": 12, "Kisumu Hub": 7, "Nakuru Express": 5 },
                last_sync:   new Date().toISOString()
            },
            {
                sku:         "NSR-1002",
                name:        "Cascade Ergonomic Support Backpack 30L",
                category:    "Accessories",
                price:       16800,
                total_stock: 6,
                reserved:    4,
                available:   2,
                status:      "Low Stock",
                warehouses:  { "Nairobi Hub": 2, "Mombasa Hub": 0, "Eldoret Depot": 0, "Kisumu Hub": 4 },
                last_sync:   new Date().toISOString()
            },
            {
                sku:         "NSR-1003",
                name:        "Glacier Thermal Base Layer (Merino Wool)",
                category:    "Apparel",
                price:       10500,
                total_stock: 115,
                reserved:    10,
                available:   105,
                status:      "In Stock",
                warehouses:  { "Nairobi Hub": 50, "Mombasa Hub": 35, "Kisumu Hub": 20, "Nakuru Express": 10 },
                last_sync:   new Date().toISOString()
            },
            {
                sku:         "NSR-1004",
                name:        "Apex Trail Running Shoes (Size 10.5)",
                category:    "Footwear",
                price:       19900,
                total_stock: 0,
                reserved:    0,
                available:   0,
                status:      "Out of Stock",
                warehouses:  { "Nairobi Hub": 0, "Mombasa Hub": 0, "Kisumu Hub": 0, "Nakuru Express": 0 },
                last_sync:   new Date().toISOString()
            },
            {
                sku:         "NSR-1005",
                name:        "Vanguard All-Terrain Hydration Vest",
                category:    "Accessories",
                price:       11500,
                total_stock: 24,
                reserved:    3,
                available:   21,
                status:      "In Stock",
                warehouses:  { "Nairobi Hub": 10, "Mombasa Hub": 8, "Kisumu Hub": 4, "Nakuru Express": 2 },
                last_sync:   new Date().toISOString()
            },
            {
                sku:         "NSR-1006",
                name:        "Polaris Insulated Stainless Tumbler 32oz",
                category:    "Gear",
                price:       4500,
                total_stock: 3,
                reserved:    1,
                available:   2,
                status:      "Low Stock",
                warehouses:  { "Nairobi Hub": 1, "Mombasa Hub": 1, "Eldoret Depot": 1, "Kisumu Hub": 0 },
                last_sync:   new Date().toISOString()
            }
        ];

        // Seed the cache with initial static data so the UI has something
        // to display immediately, before the first warehouse poll fires.
        this.cache.set(CACHE_KEYS.ALL_STOCK, [...this.inventoryData]);
    }

    // ───────────────────────────────────────────────────────────────────────
    // Observer pattern — unchanged from Sprint 2
    // ───────────────────────────────────────────────────────────────────────

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        // Refresh cache stats in syncState before notifying
        this.syncState.cacheHitRate = this.cache.getStats().hitRate;
        this.listeners.forEach(fn => fn(this.syncState, this.inventoryData));
    }

    // ───────────────────────────────────────────────────────────────────────
    // Day 3 Spec 1 — Warehouse API Polling (every 5 minutes)
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Start the 5-minute warehouse poll loop.
     * Fires an immediate poll, then repeats every `warehousePollingIntervalMs`.
     * Runs independently of the existing `startAutoSync()` UI sync timer.
     */
    startWarehousePolling() {
        if (this.warehousePollingTimer) {
            clearInterval(this.warehousePollingTimer);
        }

        this.isPollingEnabled        = true;
        this.syncState.pollingActive = true;

        // Immediate first poll so the dashboard is never stale on load
        this._executePoll();

        this.warehousePollingTimer = setInterval(() => {
            if (this.isPollingEnabled) {
                this._executePoll();
            }
        }, this.warehousePollingIntervalMs);

        console.info(
            `[WarehousePoller] Started — polling every ${this.warehousePollingIntervalMs / 60_000} min`
        );
    }

    /** Stop the warehouse polling loop without affecting the UI sync timer. */
    stopWarehousePolling() {
        this.isPollingEnabled        = false;
        this.syncState.pollingActive = false;

        if (this.warehousePollingTimer) {
            clearInterval(this.warehousePollingTimer);
            this.warehousePollingTimer = null;
        }

        console.info('[WarehousePoller] Stopped.');
        this.notify();
    }

    /**
     * Execute a single warehouse API poll cycle.
     * On success  → refreshes inventoryData + populates cache.
     * On failure  → retains last-good cache entry (graceful degradation).
     * @private
     */
    async _executePoll() {
        console.info(
            `[WarehousePoller] Polling warehouse API at ${new Date().toLocaleTimeString()}`
        );

        try {
            const outcome = await this.apiClient.getInventory();

            if (outcome.success && outcome.result?.data?.items) {
                const freshItems = outcome.result.data.items;

                // Update in-memory store
                this.inventoryData        = freshItems;
                this.syncState.itemsCount = freshItems.length;

                // Refresh cache entries
                this.cache.set(CACHE_KEYS.ALL_STOCK,   [...freshItems]);
                this.cache.set(CACHE_KEYS.LAST_POLLED, Date.now());

                this.lastWarehousePollTime       = new Date().toLocaleTimeString();
                this.syncState.lastWarehousePoll = this.lastWarehousePollTime;

                console.info(
                    `[WarehousePoller] Cache refreshed — ${freshItems.length} SKUs stored.`
                );
            } else {
                console.warn(
                    '[WarehousePoller] API responded but returned no items. Retaining stale cache.'
                );
            }
        } catch (err) {
            // Network / timeout — do NOT clear the cache; serve stale data
            console.error('[WarehousePoller] Poll failed:', err?.message ?? err);
            console.warn('[WarehousePoller] Serving last-good cached data until next poll.');
        }

        this.notify();
    }

    // ───────────────────────────────────────────────────────────────────────
    // Existing Sprint 2 — UI-facing auto-sync (logic unchanged)
    // ───────────────────────────────────────────────────────────────────────

    startAutoSync() {
        this.isAutoSyncEnabled = true;
        if (this.syncTimer) clearInterval(this.syncTimer);

        // Notify subscribers immediately with initial state
        this.notify();

        // Initial sync
        this.performSync();

        this.syncTimer = setInterval(() => {
            if (this.isAutoSyncEnabled) {
                this.performSync();
            }
        }, this.syncIntervalMs);
    }

    stopAutoSync() {
        this.isAutoSyncEnabled = false;
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        this.syncState.status = 'PAUSED';
        this.notify();
    }

    async performSync(isManual = false) {
        if (this.syncState.status === 'SYNCING') return;

        this.syncState.status = 'SYNCING';
        this.notify();

        const outcome = await this.apiClient.triggerSync({ isManual });

        this.syncState.totalSyncs++;
        this.syncState.lastSyncTime = new Date().toLocaleTimeString();

        if (outcome.telemetry) {
            this.syncState.retriesTriggered += outcome.telemetry.totalRetries || 0;
        }

        if (outcome.success) {
            this.syncState.status = 'SUCCESS';
            this.syncState.successfulSyncs++;

            // Fetch fresh inventory data after sync and refresh cache
            const inventoryOutcome = await this.apiClient.getInventory();
            if (inventoryOutcome.success && inventoryOutcome.result?.data?.items) {
                const freshItems = inventoryOutcome.result.data.items;
                this.inventoryData        = freshItems;
                this.syncState.itemsCount = freshItems.length;
                this.cache.set(CACHE_KEYS.ALL_STOCK, [...freshItems]);
            }
        } else {
            this.syncState.status = 'ERROR';
            this.syncState.failedSyncs++;
            this.syncState.lastError = outcome.error || 'Sync Failed';
        }

        this.notify();
        return outcome;
    }

    // ───────────────────────────────────────────────────────────────────────
    // Day 3 Spec 3 — Dashboard Query Endpoint
    // ───────────────────────────────────────────────────────────────────────

    /**
     * getStockAvailability — the primary real-time query endpoint for the
     * dashboard UI.
     *
     * Design contract:
     *   - ALWAYS returns a structured response object (never throws).
     *   - Reads from the local cache first (cache-aside pattern).
     *   - Falls back to live inventoryData if the cache is empty or expired.
     *   - Includes metadata the dashboard can use for freshness indicators.
     *   - Supports filtering by SKU, product name, category, or warehouse name.
     *
     * @param {string} [skuOrQuery='']         SKU, name, category, or warehouse filter.
     *                                         Omit or pass '' to get all stock.
     * @param {object} [options]
     * @param {boolean} [options.forceFresh]   Bypass cache; use live inventoryData.
     *
     * @returns {{
     *   found:         boolean,
     *   items:         Array,
     *   cacheHit:      boolean,
     *   cacheAge:      number|null,    ms since data was cached
     *   lastPolled:    string|null,    human-readable last warehouse poll time
     *   syncStatus:    string,
     *   pollingActive: boolean,
     *   error:         string|null
     * }}
     */
    getStockAvailability(skuOrQuery = '', options = {}) {
        const { forceFresh = false } = options;

        let sourceData;
        let cacheHit = false;
        let cacheAge = null;

        // ── 1. Try cache first (unless caller wants a guaranteed fresh read) ──
        if (!forceFresh) {
            const cached = this.cache.get(CACHE_KEYS.ALL_STOCK);
            if (cached) {
                sourceData = cached;
                cacheHit   = true;
                const meta = this.cache.meta(CACHE_KEYS.ALL_STOCK);
                cacheAge   = meta ? meta.ageMs : null;
            }
        }

        // ── 2. Fall back to live in-memory data on cache miss ─────────────
        if (!sourceData) {
            sourceData = this.inventoryData;
        }

        // ── 3. Apply filter ───────────────────────────────────────────────
        let items;
        const raw = (skuOrQuery || '').trim();

        if (!raw) {
            items = [...sourceData];
        } else {
            const term = raw.toLowerCase();
            items = sourceData.filter(item =>
                item.sku.toLowerCase().includes(term)      ||
                item.name.toLowerCase().includes(term)     ||
                item.category.toLowerCase().includes(term) ||
                // Allows queries like "Nairobi Hub" for warehouse-level lookups
                Object.keys(item.warehouses || {}).some(wh =>
                    wh.toLowerCase().includes(term)
                )
            );
        }

        return {
            found:         items.length > 0,
            items,
            cacheHit,
            cacheAge,
            lastPolled:    this.lastWarehousePollTime,
            syncStatus:    this.syncState.status,
            pollingActive: this.syncState.pollingActive,
            error:         null
        };
    }

    /**
     * queryStock — backwards-compatible alias for Sprint 2 callers.
     * New dashboard code should prefer `getStockAvailability()` for richer metadata.
     *
     * Supports flexible SKU matching (e.g. "1001", "nsr-1001", "NSR-1001").
     * @param {string} skuOrQuery
     * @returns {Array}
     */
    queryStock(skuOrQuery) {
        return this.getStockAvailability(skuOrQuery).items;
    }

    // ───────────────────────────────────────────────────────────────────────
    // Utility helpers — exposed for the dashboard's System Health panel
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Returns a live snapshot of the cache statistics.
     * @returns {{ entries: number, hits: number, misses: number, hitRate: string }}
     */
    getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * Force-invalidate the stock cache. Use when an external signal (e.g. a
     * webhook from the warehouse) indicates that data is definitely stale.
     */
    invalidateCache() {
        this.cache.invalidate(CACHE_KEYS.ALL_STOCK);
        console.info('[StockCache] Cache invalidated — next query will read live data.');
    }
}
