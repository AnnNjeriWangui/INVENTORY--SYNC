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
            itemsCount: 0
        };

        this.listeners = [];
        this.inventoryData = [];
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

        const syncStart = Date.now();
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
     */
    queryStock(skuOrQuery) {
        if (!skuOrQuery) return this.inventoryData;

        const term = skuOrQuery.trim().toLowerCase();
        return this.inventoryData.filter(item => 
            item.sku.toLowerCase() === term ||
            item.name.toLowerCase().includes(term) ||
            item.category.toLowerCase().includes(term)
        );
    }
}
