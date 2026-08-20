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
                            price: 189.99,
                            total_stock: 42,
                            reserved: 5,
                            available: 37,
                            status: "In Stock",
                            warehouses: { "Seattle Hub": 18, "Chicago Hub": 12, "Dallas Hub": 7, "NYC Express": 5 },
                            last_sync: new Date().toISOString()
                        },
                        {
                            sku: "NSR-1002",
                            name: "Cascade Ergonomic Support Backpack 30L",
                            category: "Accessories",
                            price: 129.50,
                            total_stock: 6,
                            reserved: 4,
                            available: 2,
                            status: "Low Stock",
                            warehouses: { "Seattle Hub": 2, "Chicago Hub": 0, "Dallas Hub": 0, "NYC Express": 4 },
                            last_sync: new Date().toISOString()
                        },
                        {
                            sku: "NSR-1003",
                            name: "Glacier Thermal Base Layer (Merino Wool)",
                            category: "Apparel",
                            price: 79.99,
                            total_stock: 115,
                            reserved: 10,
                            available: 105,
                            status: "In Stock",
                            warehouses: { "Seattle Hub": 50, "Chicago Hub": 35, "Dallas Hub": 20, "NYC Express": 10 },
                            last_sync: new Date().toISOString()
                        },
                        {
                            sku: "NSR-1004",
                            name: "Apex Trail Running Shoes (Size 10.5)",
                            category: "Footwear",
                            price: 154.00,
                            total_stock: 0,
                            reserved: 0,
                            available: 0,
                            status: "Out of Stock",
                            warehouses: { "Seattle Hub": 0, "Chicago Hub": 0, "Dallas Hub": 0, "NYC Express": 0 },
                            last_sync: new Date().toISOString()
                        },
                        {
                            sku: "NSR-1005",
                            name: "Vanguard All-Terrain Hydration Vest",
                            category: "Accessories",
                            price: 89.00,
                            total_stock: 24,
                            reserved: 3,
                            available: 21,
                            status: "In Stock",
                            warehouses: { "Seattle Hub": 10, "Chicago Hub": 8, "Dallas Hub": 4, "NYC Express": 2 },
                            last_sync: new Date().toISOString()
                        },
                        {
                            sku: "NSR-1006",
                            name: "Polaris Insulated Stainless Tumbler 32oz",
                            category: "Gear",
                            price: 34.99,
                            total_stock: 3,
                            reserved: 1,
                            available: 2,
                            status: "Low Stock",
                            warehouses: { "Seattle Hub": 1, "Chicago Hub": 1, "Dallas Hub": 1, "NYC Express": 0 },
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
