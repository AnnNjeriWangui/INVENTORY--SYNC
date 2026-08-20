/**
 * Northstar Retail Co. - Main Application Controller
 * Sprint 2: Live Inventory Sync Service with User-Facing Retry & Backoff Feedback
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

  // Status Badges & Metrics
  const pulseDot = document.getElementById('pulseDot');
  const syncStatusText = document.getElementById('syncStatusText');
  const lastSyncTimestamp = document.getElementById('lastSyncTimestamp');
  
  const metricTotalSkus = document.getElementById('metricTotalSkus');
  const metricInStock = document.getElementById('metricInStock');
  const metricLowStock = document.getElementById('metricLowStock');
  const metricRetriesCount = document.getElementById('metricRetriesCount');

  // User-Facing Retry & Backoff Feedback Banner Elements
  const userRetryBanner = document.getElementById('userRetryBanner');
  const bannerStatusText = document.getElementById('bannerStatusText');
  const bannerAttemptBadge = document.getElementById('bannerAttemptBadge');
  const bannerCountdownMsg = document.getElementById('bannerCountdownMsg');
  const bannerCountdownTime = document.getElementById('bannerCountdownTime');
  const backoffProgressFill = document.getElementById('backoffProgressFill');

  // Customer Fallback Error Card Elements
  const customerFallbackCard = document.getElementById('customerFallbackCard');
  const btnFallbackRetry = document.getElementById('btnFallbackRetry');
  const btnDismissFallback = document.getElementById('btnDismissFallback');

  // Retry Controls
  const inputMaxRetries = document.getElementById('inputMaxRetries');
  const lblMaxRetries = document.getElementById('lblMaxRetries');
  const inputBaseDelay = document.getElementById('inputBaseDelay');
  const lblBaseDelay = document.getElementById('lblBaseDelay');
  const selectJitter = document.getElementById('selectJitter');
  const selectSimScenario = document.getElementById('selectSimScenario');

  // Global State for UI Component Binding
  let currentSyncState = {
    isRetrying: false,
    isFallbackActive: false,
    attemptNumber: 1,
    maxRetries: 3,
    remainingSeconds: '0.0'
  };

  // Helper to show/hide user-facing retry banner
  function showUserRetryBanner() {
    if (userRetryBanner) userRetryBanner.classList.remove('hidden');
  }

  function hideUserRetryBanner() {
    if (userRetryBanner) userRetryBanner.classList.add('hidden');
  }

  // Telemetry Listener for User-Facing Feedback State
  apiClient.onTelemetry((event) => {
    switch (event.type) {
      case 'ATTEMPT_START':
        currentSyncState.isRetrying = event.attempt > 1;
        currentSyncState.attemptNumber = event.attempt;
        currentSyncState.maxRetries = event.maxRetries;

        if (event.attempt > 1) {
          showUserRetryBanner();
          if (bannerStatusText) bannerStatusText.textContent = `Syncing with regional distribution hubs... Executing attempt ${event.attempt} of ${event.maxRetries + 1}`;
          if (bannerAttemptBadge) bannerAttemptBadge.textContent = `Attempt ${event.attempt} of ${event.maxRetries + 1}`;
          if (bannerCountdownMsg) bannerCountdownMsg.textContent = `Transmitting HTTP payload to regional servers...`;
          if (bannerCountdownTime) bannerCountdownTime.textContent = `In Progress`;
          if (backoffProgressFill) backoffProgressFill.style.width = `100%`;
        }
        break;

      case 'BACKOFF_START':
      case 'BACKOFF_TICK':
        currentSyncState.isRetrying = true;
        currentSyncState.attemptNumber = event.attempt;
        currentSyncState.maxRetries = event.maxRetries;

        showUserRetryBanner();
        if (customerFallbackCard) customerFallbackCard.classList.add('hidden');

        if (bannerStatusText) {
          bannerStatusText.textContent = `Syncing with regional distribution hubs... Retrying attempt ${event.attempt} of ${event.maxRetries + 1}`;
        }
        if (bannerAttemptBadge) {
          bannerAttemptBadge.textContent = `Retrying attempt ${event.attempt} of ${event.maxRetries + 1}`;
        }
        if (bannerCountdownMsg) {
          bannerCountdownMsg.textContent = `Exponential backoff delay active...`;
        }
        if (bannerCountdownTime) {
          const sec = (event.remainingMs / 1000).toFixed(1);
          bannerCountdownTime.textContent = `${sec}s remaining`;
        }
        if (backoffProgressFill) {
          backoffProgressFill.style.width = `${event.progressPercent}%`;
        }
        break;

      case 'ATTEMPT_SUCCESS':
        currentSyncState.isRetrying = false;
        currentSyncState.isFallbackActive = false;

        if (backoffProgressFill) backoffProgressFill.style.width = `100%`;
        if (bannerStatusText) bannerStatusText.textContent = `Successfully synced with regional distribution hubs!`;
        
        setTimeout(() => {
          hideUserRetryBanner();
        }, 800);

        if (customerFallbackCard) customerFallbackCard.classList.add('hidden');
        break;

      case 'RETRY_EXHAUSTED':
        currentSyncState.isRetrying = false;
        currentSyncState.isFallbackActive = true;

        hideUserRetryBanner();
        if (customerFallbackCard) customerFallbackCard.classList.remove('hidden');
        if (syncStatusText) syncStatusText.textContent = 'Using Offline Stock Snapshot';
        if (pulseDot) pulseDot.className = 'pulse-dot error';
        break;
    }

    // Re-render current inventory view to update component bindings
    const currentQuery = searchInput.value;
    const currentCat = categoryFilter.value;
    let filtered = syncService.queryStock(currentQuery);
    if (currentCat !== 'all') {
      filtered = filtered.filter(i => i.category.toLowerCase() === currentCat.toLowerCase());
    }
    renderInventory(filtered);
  });

  // Render Product Inventory Cards with UI Component Binding
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

      // Live component binding for retry/backoff state
      let retryStatusMarkup = '';
      if (currentSyncState.isRetrying) {
        retryStatusMarkup = `
          <div class="card-retry-badge retry-active">
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Retrying Attempt ${currentSyncState.attemptNumber}/${currentSyncState.maxRetries + 1}...
          </div>
        `;
      } else if (currentSyncState.isFallbackActive) {
        retryStatusMarkup = `
          <div class="card-retry-badge fallback-mode">
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            Offline Verified Stock Snapshot
          </div>
        `;
      } else {
        retryStatusMarkup = `
          <div class="card-retry-badge">
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            Live Synced (Backoff Active)
          </div>
        `;
      }

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
              <span class="product-price">KSh ${item.price.toLocaleString()}</span>
            </div>

            ${retryStatusMarkup}

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

    if (!currentSyncState.isFallbackActive) {
      if (state.status === 'SYNCING') {
        pulseDot.className = 'pulse-dot syncing';
        syncStatusText.textContent = currentSyncState.isRetrying 
          ? `Retrying Attempt ${currentSyncState.attemptNumber}...`
          : 'Syncing Inventory...';
      } else if (state.status === 'SUCCESS') {
        pulseDot.className = 'pulse-dot';
        syncStatusText.textContent = 'Live Sync Active';
        lastSyncTimestamp.textContent = `Last Sync: ${state.lastSyncTime || 'Just now'}`;
      } else if (state.status === 'ERROR') {
        pulseDot.className = 'pulse-dot error';
        syncStatusText.textContent = 'Sync Error (Retrying)';
      }
    }

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
    if (customerFallbackCard) customerFallbackCard.classList.add('hidden');
    await syncService.performSync(true);
  });

  // Fallback Action Buttons
  if (btnFallbackRetry) {
    btnFallbackRetry.addEventListener('click', async () => {
      if (customerFallbackCard) customerFallbackCard.classList.add('hidden');
      await syncService.performSync(true);
    });
  }

  if (btnDismissFallback) {
    btnDismissFallback.addEventListener('click', () => {
      if (customerFallbackCard) customerFallbackCard.classList.add('hidden');
    });
  }

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
    if (customerFallbackCard) customerFallbackCard.classList.add('hidden');
    await syncService.performSync(true);
  });

  // Start Sync Engine
  syncService.startAutoSync();
});
