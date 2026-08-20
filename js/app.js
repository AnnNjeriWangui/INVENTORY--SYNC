/**
 * Northstar Retail Co. - Main Application Controller
 * Sprint 2: Live Inventory Sync Service
 */

import { InventoryApiClient } from './api-client.js';
import { LiveInventorySyncService } from './sync-service.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Client & Service
  const apiClient = new InventoryApiClient();
  const syncService = new LiveInventorySyncService(apiClient, { syncIntervalMs: 20000 });

  // DOM Elements
  const inventoryGrid = document.getElementById('inventoryGrid');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const btnForceSync = document.getElementById('btnForceSync');
  const btnTestRetry = document.getElementById('btnTestRetry');
  const btnClearLog = document.getElementById('btnClearLog');

  // Status Badges & Metrics
  const pulseDot = document.getElementById('pulseDot');
  const syncStatusText = document.getElementById('syncStatusText');
  const lastSyncTimestamp = document.getElementById('lastSyncTimestamp');
  
  const metricTotalSkus = document.getElementById('metricTotalSkus');
  const metricInStock = document.getElementById('metricInStock');
  const metricLowStock = document.getElementById('metricLowStock');
  const metricRetriesCount = document.getElementById('metricRetriesCount');

  // Retry Controls
  const inputMaxRetries = document.getElementById('inputMaxRetries');
  const lblMaxRetries = document.getElementById('lblMaxRetries');
  const inputBaseDelay = document.getElementById('inputBaseDelay');
  const lblBaseDelay = document.getElementById('lblBaseDelay');
  const selectJitter = document.getElementById('selectJitter');
  const selectSimScenario = document.getElementById('selectSimScenario');

  // Console Logs
  const consoleLogs = document.getElementById('consoleLogs');

  // Logger helper
  function addConsoleLog(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const timeStr = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${msg}`;
    consoleLogs.appendChild(entry);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  // Telemetry listener
  apiClient.onTelemetry((event) => {
    switch (event.type) {
      case 'ATTEMPT_START':
        addConsoleLog(`⚡ Attempt ${event.attempt}/${event.maxRetries + 1} sending API request...`, 'info');
        break;
      case 'BACKOFF_WAIT':
        addConsoleLog(`⏳ Exponential Backoff: Waiting ${event.delayMs}ms before attempt ${event.attempt}...`, 'backoff');
        break;
      case 'ATTEMPT_FAILED':
        addConsoleLog(`⚠️ Attempt ${event.attempt} failed (${event.error}). ${event.willRetry ? 'Retrying...' : 'Exhausted.'}`, 'error');
        break;
      case 'ATTEMPT_SUCCESS':
        addConsoleLog(`✅ Attempt ${event.attempt} succeeded in ${event.durationMs}ms (HTTP ${event.status})`, 'success');
        break;
      case 'CONFIG_CHANGE':
        addConsoleLog(`🔧 ${event.text}`, 'warn');
        break;
    }
  });

  // Render Product Inventory Cards
  function renderInventory(items) {
    if (!items || items.length === 0) {
      inventoryGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-muted);">
          No matching products found for this stock query.
        </div>
      `;
      return;
    }

    inventoryGrid.innerHTML = items.map(item => {
      let statusClass = 'in-stock';
      let progressClass = 'fill-in-stock';
      if (item.status === 'Low Stock') {
        statusClass = 'low-stock';
        progressClass = 'fill-low-stock';
      } else if (item.status === 'Out of Stock') {
        statusClass = 'out-of-stock';
        progressClass = 'fill-out-stock';
      }

      const total = item.total_stock || 0;
      const avail = item.available || 0;
      const percent = Math.min(100, Math.round((avail / (total || 1)) * 100));

      const warehouseTags = item.warehouses ? Object.entries(item.warehouses).map(([wh, count]) => `
        <span class="wh-tag">${wh}: <strong>${count}</strong></span>
      `).join('') : '';

      return `
        <article class="product-card">
          <div>
            <div class="product-header">
              <span class="product-sku">${item.sku}</span>
              <span class="badge-status ${statusClass}">${item.status}</span>
            </div>
            
            <h3 class="product-title">${item.name}</h3>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-size: 0.78rem; color: var(--text-muted);">${item.category}</span>
              <span class="product-price">$${item.price.toFixed(2)}</span>
            </div>

            <div class="stock-meter-container">
              <div class="stock-meter-labels">
                <span>Available: <strong>${avail}</strong> / ${total}</span>
                <span>Reserved: ${item.reserved}</span>
              </div>
              <div class="stock-progress-bar">
                <div class="stock-progress-fill ${progressClass}" style="width: ${percent}%;"></div>
              </div>
            </div>
          </div>

          <div class="warehouse-breakdown">
            <span style="color: var(--text-muted); font-weight: 500;">Warehouse Distribution:</span>
            <div class="warehouse-tags">
              ${warehouseTags}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // Update Metric Counters
  function updateMetrics(items) {
    if (!items) return;
    metricTotalSkus.textContent = items.length;
    
    const inStockCount = items.filter(i => i.status === 'In Stock').length;
    const lowStockCount = items.filter(i => i.status === 'Low Stock').length;
    
    metricInStock.textContent = inStockCount;
    metricLowStock.textContent = lowStockCount;
  }

  // Sync State Subscriber
  syncService.subscribe((state, items) => {
    metricRetriesCount.textContent = state.retriesTriggered || 0;

    if (state.status === 'SYNCING') {
      pulseDot.className = 'pulse-dot syncing';
      syncStatusText.textContent = 'Syncing Inventory...';
    } else if (state.status === 'SUCCESS') {
      pulseDot.className = 'pulse-dot';
      syncStatusText.textContent = 'Live Sync Active';
      lastSyncTimestamp.textContent = `Last Sync: ${state.lastSyncTime || 'Just now'}`;
    } else if (state.status === 'ERROR') {
      pulseDot.className = 'pulse-dot error';
      syncStatusText.textContent = 'Sync Warning (Retrying)';
    }

    // Filter items based on current search input
    const currentQuery = searchInput.value;
    const currentCat = categoryFilter.value;

    let filtered = syncService.queryStock(currentQuery);
    if (currentCat !== 'all') {
      filtered = filtered.filter(i => i.category.toLowerCase() === currentCat.toLowerCase());
    }

    renderInventory(filtered);
    updateMetrics(items);
  });

  // Event Listeners for Search
  searchInput.addEventListener('input', () => {
    const filtered = syncService.queryStock(searchInput.value);
    const cat = categoryFilter.value;
    const finalFiltered = cat === 'all' ? filtered : filtered.filter(i => i.category.toLowerCase() === cat.toLowerCase());
    renderInventory(finalFiltered);
  });

  categoryFilter.addEventListener('change', () => {
    const filtered = syncService.queryStock(searchInput.value);
    const cat = categoryFilter.value;
    const finalFiltered = cat === 'all' ? filtered : filtered.filter(i => i.category.toLowerCase() === cat.toLowerCase());
    renderInventory(finalFiltered);
  });

  // Force Sync Button
  btnForceSync.addEventListener('click', async () => {
    addConsoleLog('🔄 Manual Force Live Sync initiated by Support Agent.', 'info');
    await syncService.performSync(true);
  });

  // Retry Controls Listeners
  inputMaxRetries.addEventListener('input', (e) => {
    lblMaxRetries.textContent = e.target.value;
    apiClient.setRetryConfig({ maxRetries: parseInt(e.target.value) });
  });

  inputBaseDelay.addEventListener('input', (e) => {
    lblBaseDelay.textContent = e.target.value;
    apiClient.setRetryConfig({ baseDelay: parseInt(e.target.value) });
  });

  selectJitter.addEventListener('change', (e) => {
    apiClient.setRetryConfig({ jitterMode: e.target.value });
  });

  // Scenario Simulator Handler
  selectSimScenario.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'none') {
      apiClient.setSimulationConfig({ failureRate: 0.0, forcedStatusCode: 0, latencyMs: 0 });
    } else if (val === 'flaky') {
      apiClient.setSimulationConfig({ failureRate: 0.5, forcedStatusCode: 0, latencyMs: 0 });
    } else if (val === '503') {
      apiClient.setSimulationConfig({ failureRate: 0.0, forcedStatusCode: 503, latencyMs: 0 });
    } else if (val === '429') {
      apiClient.setSimulationConfig({ failureRate: 0.0, forcedStatusCode: 429, latencyMs: 0 });
    } else if (val === 'latency') {
      apiClient.setSimulationConfig({ failureRate: 0.0, forcedStatusCode: 0, latencyMs: 2000 });
    }
  });

  // Test Retry Run
  btnTestRetry.addEventListener('click', async () => {
    addConsoleLog('🧪 Running Resilient Sync Test with current fault settings...', 'warn');
    await syncService.performSync(true);
  });

  btnClearLog.addEventListener('click', () => {
    consoleLogs.innerHTML = '';
  });

  // Start Sync Engine
  syncService.startAutoSync();
});
