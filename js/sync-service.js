/**
 * Northstar Retail Co. - Live Inventory Sync Service
 * Sprint 2: Resilient Synchronization Manager
 */

export class LiveInventorySyncService {
    constructor(apiClient, options = {}) {
        this.apiClient = apiClient;
        this.syncIntervalMs = options.syncIntervalMs || 15000; // default 15s sync interval
        this.isAutoSyncEnabled = true;
        this.syncTimer = null;

        this.syncState = {
            status: 'IDLE', // IDLE, SYNCING, SUCCESS, ERROR
            lastSyncTime: null,
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            retriesTriggered: 0,
            itemsCount: 6
        };

        this.listeners = [];
        this.inventoryData = [
            {
                sku: "NSR-1001",
                name: "Northstar Summit Waterproof Parka",
                category: "Outerwear",
                price: 24500,
                total_stock: 42,
                reserved: 5,
                available: 37,
                status: "In Stock",
                warehouses: { "Nairobi Hub": 18, "Mombasa Hub": 12, "Kisumu Hub": 7, "Nakuru Express": 5 },
                last_sync: new Date().toISOString()
            },
            {
                sku: "NSR-1002",
                name: "Cascade Ergonomic Support Backpack 30L",
                category: "Accessories",
                price: 16800,
                total_stock: 6,
                reserved: 4,
                available: 2,
                status: "Low Stock",
                warehouses: { "Nairobi Hub": 2, "Mombasa Hub": 0, "Eldoret Depot": 0, "Kisumu Hub": 4 },
                last_sync: new Date().toISOString()
            },
            {
                sku: "NSR-1003",
                name: "Glacier Thermal Base Layer (Merino Wool)",
                category: "Apparel",
                price: 10500,
                total_stock: 115,
                reserved: 10,
                available: 105,
                status: "In Stock",
                warehouses: { "Nairobi Hub": 50, "Mombasa Hub": 35, "Kisumu Hub": 20, "Nakuru Express": 10 },
                last_sync: new Date().toISOString()
            },
            {
                sku: "NSR-1004",
                name: "Apex Trail Running Shoes (Size 10.5)",
                category: "Footwear",
                price: 19900,
                total_stock: 0,
                reserved: 0,
                available: 0,
                status: "Out of Stock",
                warehouses: { "Nairobi Hub": 0, "Mombasa Hub": 0, "Kisumu Hub": 0, "Nakuru Express": 0 },
                last_sync: new Date().toISOString()
            },
            {
                sku: "NSR-1005",
                name: "Vanguard All-Terrain Hydration Vest",
                category: "Accessories",
                price: 11500,
                total_stock: 24,
                reserved: 3,
                available: 21,
                status: "In Stock",
                warehouses: { "Nairobi Hub": 10, "Mombasa Hub": 8, "Kisumu Hub": 4, "Nakuru Express": 2 },
                last_sync: new Date().toISOString()
            },
            {
                sku: "NSR-1006",
                name: "Polaris Insulated Stainless Tumbler 32oz",
                category: "Gear",
                price: 4500,
                total_stock: 3,
                reserved: 1,
                available: 2,
                status: "Low Stock",
                warehouses: { "Nairobi Hub": 1, "Mombasa Hub": 1, "Eldoret Depot": 1, "Kisumu Hub": 0 },
                last_sync: new Date().toISOString()
            }
        ];
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(fn => fn(this.syncState, this.inventoryData));
    }

    startAutoSync() {
        this.isAutoSyncEnabled = true;
        if (this.syncTimer) clearInterval(this.syncTimer);
        
        // Notify subscribers immediately with default initial state
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

            // Fetch fresh inventory data after sync
            const inventoryOutcome = await this.apiClient.getInventory();
            if (inventoryOutcome.success && inventoryOutcome.result?.data?.items) {
                this.inventoryData = inventoryOutcome.result.data.items;
                this.syncState.itemsCount = this.inventoryData.length;
            }
        } else {
            this.syncState.status = 'ERROR';
            this.syncState.failedSyncs++;
            this.syncState.lastError = outcome.error || 'Sync Failed';
        }

        this.notify();
        return outcome;
    }

    /**
     * Look up inventory item by SKU or keyword for Support Tools
     * Supports flexible SKU matching (e.g. "1001", "nsr-1001", "NSR-1001")
     */
    queryStock(skuOrQuery) {
        if (!skuOrQuery) return this.inventoryData;

        const term = skuOrQuery.trim().toLowerCase();
        return this.inventoryData.filter(item => 
            item.sku.toLowerCase().includes(term) ||
            item.name.toLowerCase().includes(term) ||
            item.category.toLowerCase().includes(term)
        );
    }
}
