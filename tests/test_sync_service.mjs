import test from 'node:test';
import assert from 'node:assert/strict';
import { StockCache, CACHE_KEYS, LiveInventorySyncService } from '../js/sync-service.js';

test('StockCache - Basic Set, Get and Cache Hit', () => {
    const cache = new StockCache(1000);
    const mockData = [{ sku: 'NSR-1001', name: 'Parka' }];
    
    cache.set('test_key', mockData);
    const retrieved = cache.get('test_key');
    
    assert.deepEqual(retrieved, mockData);
    assert.equal(cache.has('test_key'), true);
    
    const stats = cache.getStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 0);
    assert.equal(stats.hitRate, '100.0%');
});

test('StockCache - Cache Miss on non-existent key', () => {
    const cache = new StockCache(1000);
    const result = cache.get('non_existent');
    
    assert.equal(result, null);
    const stats = cache.getStats();
    assert.equal(stats.misses, 1);
    assert.equal(stats.hits, 0);
});

test('StockCache - Expiration with TTL', async () => {
    const cache = new StockCache(50); // 50ms TTL
    cache.set('expiring_key', { value: 42 });
    
    assert.ok(cache.get('expiring_key') !== null);
    
    // Wait for TTL to pass
    await new Promise(resolve => setTimeout(resolve, 70));
    
    assert.equal(cache.get('expiring_key'), null);
    assert.equal(cache.has('expiring_key'), false);
});

test('StockCache - Invalidation and Clear', () => {
    const cache = new StockCache(5000);
    cache.set('k1', 'val1');
    cache.set('k2', 'val2');
    
    cache.invalidate('k1');
    assert.equal(cache.get('k1'), null);
    assert.equal(cache.get('k2'), 'val2');
    
    cache.clear();
    assert.equal(cache.get('k2'), null);
    assert.equal(cache.getStats().entries, 0);
});

test('StockCache - Metadata Inspection', () => {
    const cache = new StockCache(5000);
    cache.set('meta_key', 'test_data');
    
    const meta = cache.meta('meta_key');
    assert.ok(meta !== null);
    assert.equal(meta.isValid, true);
    assert.equal(meta.ttlMs, 5000);
    assert.ok(meta.ageMs >= 0);
});

test('LiveInventorySyncService - getStockAvailability cache-aside and filtering', () => {
    const mockApiClient = {
        getInventory: async () => ({ success: true, result: { data: { items: [] } } }),
        triggerSync: async () => ({ success: true })
    };
    
    const service = new LiveInventorySyncService(mockApiClient, {
        warehousePollingIntervalMs: 300000,
        cacheTtlMs: 360000
    });
    
    // 1. Query all stock (seeded from cache)
    const allStock = service.getStockAvailability();
    assert.equal(allStock.found, true);
    assert.equal(allStock.cacheHit, true);
    assert.equal(allStock.items.length, 6);
    
    // 2. Query by SKU
    const parkaQuery = service.getStockAvailability('NSR-1001');
    assert.equal(parkaQuery.found, true);
    assert.equal(parkaQuery.items.length, 1);
    assert.equal(parkaQuery.items[0].sku, 'NSR-1001');
    
    // 3. Query by warehouse name
    const nairobiQuery = service.getStockAvailability('Nairobi Hub');
    assert.equal(nairobiQuery.found, true);
    assert.ok(nairobiQuery.items.length > 0);
    
    // 4. Force fresh read
    const freshQuery = service.getStockAvailability('NSR-1001', { forceFresh: true });
    assert.equal(freshQuery.cacheHit, false);
    assert.equal(freshQuery.found, true);
});

test('LiveInventorySyncService - Warehouse Polling Lifecycle and Graceful Degradation', async () => {
    let callCount = 0;
    const mockItems = [
        {
            sku: 'NSR-9999',
            name: 'Special Edition Tent',
            category: 'Gear',
            price: 50000,
            total_stock: 10,
            reserved: 1,
            available: 9,
            status: 'In Stock',
            warehouses: { 'Nairobi Hub': 9 },
            last_sync: new Date().toISOString()
        }
    ];

    const mockApiClient = {
        getInventory: async () => {
            callCount++;
            if (callCount === 1) {
                return { success: true, result: { data: { items: mockItems } } };
            }
            throw new Error('Warehouse Connection Dropped');
        },
        triggerSync: async () => ({ success: true })
    };

    const service = new LiveInventorySyncService(mockApiClient, {
        warehousePollingIntervalMs: 100, // fast poll for testing
        cacheTtlMs: 5000
    });

    let notifiedCount = 0;
    service.subscribe(() => {
        notifiedCount++;
    });

    // Start polling (executes immediate poll #1)
    service.startWarehousePolling();
    assert.equal(service.syncState.pollingActive, true);
    
    // Allow immediate poll to settle
    await new Promise(resolve => setTimeout(resolve, 50));
    
    assert.equal(callCount, 1);
    assert.equal(service.inventoryData.length, 1);
    assert.equal(service.inventoryData[0].sku, 'NSR-9999');
    
    const cachedStock = service.cache.get(CACHE_KEYS.ALL_STOCK);
    assert.deepEqual(cachedStock, mockItems);

    // Wait for second poll (callCount 2 - fails gracefully without wiping cache)
    await new Promise(resolve => setTimeout(resolve, 110));
    assert.equal(callCount, 2);
    
    // Cache must still retain the last-good snapshot
    const queryAfterFail = service.getStockAvailability('NSR-9999');
    assert.equal(queryAfterFail.found, true);
    assert.equal(queryAfterFail.items[0].sku, 'NSR-9999');
    
    // Stop polling
    service.stopWarehousePolling();
    assert.equal(service.syncState.pollingActive, false);
});
