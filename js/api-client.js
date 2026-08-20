/**
 * Northstar Retail Co. - API Client & Network Simulator
 * Sprint 2: Live Inventory Sync Service
 */

import { RetryBackoffHandler } from './retry-backoff.js';

export class InventoryApiClient {
    constructor() {
        this.baseUrl = window.location.origin;
        this.simulationMode = {
            enabled: false,
            failureRate: 0.0, // 0.0 to 1.0
            forcedStatusCode: 0, // 503, 429, 500, etc.
            latencyMs: 0
        };

        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 400,
            maxDelay: 6000,
            backoffFactor: 2.0,
            jitterMode: 'full'
        };

        this.telemetryListeners = [];
    }

    onTelemetry(callback) {
        this.telemetryListeners.push(callback);
    }

    notifyTelemetry(event) {
        this.telemetryListeners.forEach(cb => cb(event));
    }

    setSimulationConfig(config) {
        this.simulationMode = { ...this.simulationMode, ...config };
        this.notifyTelemetry({
            type: 'CONFIG_CHANGE',
            text: `Simulation mode updated: failureRate=${(this.simulationMode.failureRate * 100).toFixed(0)}%, forcedStatus=${this.simulationMode.forcedStatusCode}`
        });
    }

    setRetryConfig(config) {
        this.retryConfig = { ...this.retryConfig, ...config };
        this.notifyTelemetry({
            type: 'CONFIG_CHANGE',
            text: `Retry settings updated: maxRetries=${this.retryConfig.maxRetries}, baseDelay=${this.retryConfig.baseDelay}ms, jitter=${this.retryConfig.jitterMode}`
        });
    }

    /**
     * Internal simulated request handler when running without backend API or when fault simulation is injected
     */
    async executeSimulatedRequest(endpoint, options = {}) {
        if (this.simulationMode.latencyMs > 0) {
            await new Promise(res => setTimeout(res, this.simulationMode.latencyMs));
        }

        // Check forced error status code
        if (this.simulationMode.forcedStatusCode > 0) {
            const code = this.simulationMode.forcedStatusCode;
            throw { status: code, message: `Simulated Fault HTTP ${code}` };
        }

        // Check failure rate
        if (this.simulationMode.failureRate > 0 && Math.random() < this.simulationMode.failureRate) {
            const randomCode = [503, 429, 500, 502][Math.floor(Math.random() * 4)];
            throw { status: randomCode, message: `Transient Failure Simulated (HTTP ${randomCode})` };
        }

        // Normal mock response fallback if endpoint fetch fails
        if (endpoint.includes('/api/inventory')) {
            return {
                status: 200,
                data: {
                    client: "Northstar Retail Co.",
                    sprint: "Sprint 2",
                    timestamp: new Date().toISOString(),
                    items: [
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
                    ]
                }
            };
        } else {
            return {
                status: 200,
                data: {
                    client: "Northstar Retail Co.",
                    sync_id: `sync_${Date.now()}`,
                    synced_items: 6,
                    status: "SUCCESS",
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    /**
     * Resilient Request Wrapper using RetryBackoffHandler
     */
    async requestWithRetry(endpoint, options = {}) {
        const handler = new RetryBackoffHandler({
            ...this.retryConfig,
            onAttempt: (event) => this.notifyTelemetry(event)
        });

        const outcome = await handler.execute(async (attemptNum) => {
            // If simulation mode forces error or latency, check simulation first
            if (this.simulationMode.forcedStatusCode > 0 || this.simulationMode.failureRate > 0 || this.simulationMode.latencyMs > 0) {
                return await this.executeSimulatedRequest(endpoint, options);
            }

            try {
                const response = await fetch(endpoint, options);
                if (!response.ok) {
                    throw { status: response.status, message: `HTTP ${response.status} - ${response.statusText}` };
                }
                const data = await response.json();
                return { status: response.status, data };
            } catch (err) {
                // If fetch fails (e.g. static environment without live backend), fallback to mock client data cleanly
                if (!err.status) {
                    return await this.executeSimulatedRequest(endpoint, options);
                }
                throw err;
            }
        });

        return outcome;
    }

    async getInventory(params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = `/api/inventory${query ? `?${query}` : ''}`;
        return await this.requestWithRetry(url, { method: 'GET' });
    }

    async triggerSync(payload = {}) {
        const url = '/api/sync';
        return await this.requestWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...payload,
                simulate_failure_rate: this.simulationMode.failureRate,
                force_status: this.simulationMode.forcedStatusCode
            })
        });
    }
}
