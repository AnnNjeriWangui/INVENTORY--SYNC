/**
 * Northstar Retail Co. — Live Stock Check
 * Sprint 2: Customer-Facing Retry & Backoff State Machine
 *
 * Design principle: every state change in the SyncStateMachine produces
 * an immediate, explicit DOM mutation. Nothing is hidden or silent.
 *
 * States that the CUSTOMER SEES:
 *   idle     → search bar open, no banner
 *   syncing  → search bar locked + spinner, "Checking stock..." banner
 *   retrying → search bar locked + spinner, RETRYING banner with live countdown
 *   success  → search bar unlocked, green success flash banner (auto-hides)
 *   failed   → search bar unlocked, persistent red fallback with "Try Again"
 */

import { InventoryApiClient }       from './api-client.js';
import { LiveInventorySyncService } from './sync-service.js';
import { SyncStateMachine, SYNC_STATES } from './sync-state-machine.js';

document.addEventListener('DOMContentLoaded', () => {

  // ── Instances ──────────────────────────────────────────────────────────────
  const apiClient  = new InventoryApiClient();
  const syncService = new LiveInventorySyncService(apiClient, { syncIntervalMs: 30000 });
  const machine    = new SyncStateMachine();

  // Default to flaky network so customers actually SEE the retry flow
  apiClient.setSimulationConfig({ failureRate: 0.6, forcedStatusCode: 0, latencyMs: 0 });

  // ── DOM refs ───────────────────────────────────────────────────────────────
  // Search
  const searchInput     = document.getElementById('searchInput');
  const searchShell     = document.getElementById('searchShell');
  const searchSpinner   = document.getElementById('searchSpinner');
  const searchHint      = document.getElementById('searchHint');
  const categoryFilter  = document.getElementById('categoryFilter');

  // Customer Sync Banner panels
  const customerBanner  = document.getElementById('customerSyncBanner');
  const csbSyncing      = document.getElementById('csbSyncing');
  const csbRetrying     = document.getElementById('csbRetrying');
  const csbSuccess      = document.getElementById('csbSuccess');
  const csbFailed       = document.getElementById('csbFailed');
  // Retrying panel internals
  const csbRetryHeadline  = document.getElementById('csbRetryHeadline');
  const csbRetrySubline   = document.getElementById('csbRetrySubline');
  const csbAttemptPill    = document.getElementById('csbAttemptPill');
  const csbCountdownFill  = document.getElementById('csbCountdownFill');
  const csbCountdownLabel = document.getElementById('csbCountdownLabel');
  const csbCountdownTime  = document.getElementById('csbCountdownTime');
  const csbSuccessDetail  = document.getElementById('csbSuccessDetail');

  // Stock section
  const stockSection    = document.getElementById('stockSection');
  const stockOverlay    = document.getElementById('stockOverlay');
  const soHeadline      = document.getElementById('soHeadline');
  const soSub           = document.getElementById('soSub');
  const inventoryGrid   = document.getElementById('inventoryGrid');

  // Header
  const pulseDot        = document.getElementById('pulseDot');
  const syncStatusText  = document.getElementById('syncStatusText');
  const lastSyncTs      = document.getElementById('lastSyncTimestamp');

  // Metrics
  const metricTotalSkus = document.getElementById('metricTotalSkus');
  const metricInStock   = document.getElementById('metricInStock');
  const metricLowStock  = document.getElementById('metricLowStock');
  const metricRetries   = document.getElementById('metricRetriesCount');

  // Buttons
  const btnForceSync    = document.getElementById('btnForceSync');
  const btnTestRetry    = document.getElementById('btnTestRetry');
  const btnFallbackRetry= document.getElementById('btnFallbackRetry');

  // Sidebar controls
  const inputMaxRetries = document.getElementById('inputMaxRetries');
  const lblMaxRetries   = document.getElementById('lblMaxRetries');
  const inputBaseDelay  = document.getElementById('inputBaseDelay');
  const lblBaseDelay    = document.getElementById('lblBaseDelay');
  const selectJitter    = document.getElementById('selectJitter');
  const selectSimScenario = document.getElementById('selectSimScenario');
  // Default selector to 'flaky' to match the default sim config
  if (selectSimScenario) selectSimScenario.value = 'flaky';

  // Local machine state mirror (for card rendering)
  let machineState   = SYNC_STATES.IDLE;
  let machineContext = {};
  let sessionRetries = 0;
  let successTimer   = null;

  // ── STATE MACHINE → COMPLETE UI SNAPSHOT ──────────────────────────────────
  //
  // This is the ONLY place visual updates happen.
  // Each state maps to an exact, complete visual configuration.
  //
  machine.subscribe((state, ctx) => {
    machineState   = state;
    machineContext = ctx;

    switch (state) {

      // ── IDLE ────────────────────────────────────────────────────────────
      case SYNC_STATES.IDLE:
        unlockSearch();
        hideBanner();
        hideOverlay();
        setPulse('idle');
        setSyncText('Ready');
        break;

      // ── SYNCING (first attempt, no failure yet) ──────────────────────────
      case SYNC_STATES.SYNCING:
        lockSearch('Checking stock...');
        showBannerPanel('syncing');
        hideOverlay();
        setPulse('syncing');
        setSyncText('Connecting...');
        break;

      // ── RETRYING (backoff tick fires ~every 50ms) ─────────────────────────
      case SYNC_STATES.RETRYING: {
        const { attempt, totalAttempts, delayMs, remainingMs, progressPercent } = ctx;
        const remSec  = (remainingMs / 1000).toFixed(1);
        const delSec  = (delayMs     / 1000).toFixed(2);

        lockSearch(`Retrying ${attempt}/${totalAttempts}...`);
        setPulse('retrying');
        setSyncText(`Retry ${attempt} of ${totalAttempts}`);

        // Update RETRYING banner content
        if (csbRetryHeadline)
          csbRetryHeadline.textContent =
            `Distribution hubs are busy. Reconnecting... (Attempt ${attempt} of ${totalAttempts})`;
        if (csbRetrySubline)
          csbRetrySubline.textContent =
            `Next retry in ${delSec}s — exponential backoff active`;
        if (csbAttemptPill)
          csbAttemptPill.textContent = `${attempt} / ${totalAttempts}`;
        if (csbCountdownFill)
          csbCountdownFill.style.width = `${progressPercent}%`;
        if (csbCountdownLabel)
          csbCountdownLabel.textContent =
            remainingMs > 0
              ? `Waiting ${delSec}s before attempting to reconnect...`
              : 'Sending request now...';
        if (csbCountdownTime)
          csbCountdownTime.textContent = remainingMs > 0 ? `${remSec}s` : '–';

        showBannerPanel('retrying');

        // Overlay locks the stock grid
        if (soHeadline)
          soHeadline.textContent = `Retrying attempt ${attempt} of ${totalAttempts}...`;
        if (soSub)
          soSub.textContent =
            remainingMs > 0
              ? `Exponential backoff — ${remSec}s until next attempt`
              : 'Firing request now...';
        showOverlay();
        break;
      }

      // ── SUCCESS ───────────────────────────────────────────────────────────
      case SYNC_STATES.SUCCESS: {
        unlockSearch();
        hideOverlay();
        setPulse('success');
        setSyncText('Live');

        const timeStr = new Date().toLocaleTimeString('en-KE', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        if (lastSyncTs) lastSyncTs.textContent = timeStr;

        if (csbSuccessDetail)
          csbSuccessDetail.textContent =
            ctx.attempt > 1
              ? `Live stock confirmed after ${ctx.attempt} attempts — all hubs reporting`
              : `Live stock confirmed — all hubs reporting`;

        showBannerPanel('success');

        // Auto-hide success banner after 2.5s then return to idle
        clearTimeout(successTimer);
        successTimer = setTimeout(() => {
          hideBanner();
          machine.reset();
        }, 2500);
        break;
      }

      // ── FAILED ────────────────────────────────────────────────────────────
      case SYNC_STATES.FAILED:
        unlockSearch();
        hideOverlay();
        setPulse('error');
        setSyncText('Offline snapshot');
        showBannerPanel('failed');
        break;
    }

    // Cards re-render on every tick so per-card badge stays live
    renderCurrentView();
  });

  // ── TELEMETRY → STATE MACHINE ─────────────────────────────────────────────
  apiClient.onTelemetry((event) => {
    switch (event.type) {

      case 'ATTEMPT_START':
        if (event.attempt === 1) {
          machine.startSync(event.maxRetries);
        }
        break;

      case 'BACKOFF_START':
      case 'BACKOFF_TICK':
        if (event.type === 'BACKOFF_START') {
          sessionRetries++;
          if (metricRetries) metricRetries.textContent = String(sessionRetries);
        }
        machine.tickBackoff({
          attempt:         event.attempt,
          maxRetries:      event.maxRetries,
          delayMs:         event.delayMs,
          remainingMs:     event.remainingMs,
          progressPercent: event.progressPercent,
        });
        break;

      case 'ATTEMPT_SUCCESS':
        machine.markSuccess(event.durationMs);
        break;

      case 'RETRY_EXHAUSTED':
        machine.markFailed(event.error || 'All retry attempts exhausted');
        break;
    }
  });

  // ── SEARCH LOCK / UNLOCK ───────────────────────────────────────────────────

  function lockSearch(statusText) {
    if (searchInput) {
      searchInput.disabled = true;
      searchInput.setAttribute('placeholder', statusText);
    }
    if (searchShell) searchShell.classList.add('locked');
    if (searchSpinner) searchSpinner.classList.add('active');
    if (categoryFilter) categoryFilter.disabled = true;
    if (searchHint) searchHint.textContent = 'Stock check in progress — please wait...';
  }

  function unlockSearch() {
    if (searchInput) {
      searchInput.disabled = false;
      searchInput.setAttribute('placeholder', 'Type a product name or SKU — e.g. NSR-1001, Parka, Backpack...');
    }
    if (searchShell) searchShell.classList.remove('locked');
    if (searchSpinner) searchSpinner.classList.remove('active');
    if (categoryFilter) categoryFilter.disabled = false;
    if (searchHint) searchHint.textContent = 'Results update live as you type — stock is verified against all distribution hubs';
  }

  // ── BANNER ─────────────────────────────────────────────────────────────────

  /**
   * Shows exactly ONE panel inside the banner and hides the rest.
   * @param {'syncing'|'retrying'|'success'|'failed'} panel
   */
  function showBannerPanel(panel) {
    if (!customerBanner) return;
    customerBanner.dataset.state = panel;
    // Toggle panel visibility
    const panels = { syncing: csbSyncing, retrying: csbRetrying, success: csbSuccess, failed: csbFailed };
    Object.entries(panels).forEach(([key, el]) => {
      if (!el) return;
      el.style.display = key === panel ? 'flex' : 'none';
    });
  }

  function hideBanner() {
    if (customerBanner) customerBanner.dataset.state = 'hidden';
  }

  // ── OVERLAY ────────────────────────────────────────────────────────────────

  function showOverlay() {
    if (stockOverlay) stockOverlay.classList.remove('hidden');
    if (stockSection) stockSection.classList.add('is-waiting');
  }

  function hideOverlay() {
    if (stockOverlay) stockOverlay.classList.add('hidden');
    if (stockSection) stockSection.classList.remove('is-waiting');
  }

  // ── HEADER PULSE ───────────────────────────────────────────────────────────

  function setPulse(variant) {
    if (!pulseDot) return;
    pulseDot.className = `pulse-dot${variant !== 'idle' ? ' ' + variant : ''}`;
  }

  function setSyncText(text) {
    if (syncStatusText) syncStatusText.textContent = text;
  }

  // ── INVENTORY RENDERING ────────────────────────────────────────────────────

  function renderCurrentView() {
    const query = searchInput ? searchInput.value : '';
    const cat   = categoryFilter ? categoryFilter.value : 'all';
    let items   = syncService.queryStock(query);
    if (cat !== 'all') items = items.filter(i => i.category.toLowerCase() === cat);
    renderInventory(items);
  }

  function renderInventory(items) {
    if (!inventoryGrid) return;

    if (!items || items.length === 0) {
      inventoryGrid.innerHTML = `
        <div style="grid-column:1/-1;padding:3rem 1rem;text-align:center;color:var(--text-muted);">
          <div style="font-size:2.5rem;margin-bottom:.75rem;">🔍</div>
          <p style="font-size:1rem;font-weight:600;">No products match your search.</p>
          <p style="font-size:.85rem;margin-top:.3rem;">Try a different SKU or product name.</p>
        </div>`;
      return;
    }

    inventoryGrid.innerHTML = items.map(item => {
      let statusClass   = 'in-stock';
      let progressClass = 'fill-in-stock';
      if (item.status === 'Low Stock')    { statusClass = 'low-stock';    progressClass = 'fill-low-stock'; }
      if (item.status === 'Out of Stock') { statusClass = 'out-of-stock'; progressClass = 'fill-out-stock'; }

      const total   = item.total_stock || 0;
      const avail   = item.available   || 0;
      const percent = Math.min(100, Math.round((avail / (total || 1)) * 100));

      const warehouseTags = item.warehouses
        ? Object.entries(item.warehouses)
            .map(([wh, n]) => `<span class="wh-tag">${wh}: <strong>${n}</strong></span>`)
            .join('')
        : '';

      // Per-card sync state badge — changes with every state tick
      let badge = '';
      if (machineState === SYNC_STATES.RETRYING) {
        const { attempt, totalAttempts, remainingMs } = machineContext;
        const sec = (remainingMs / 1000).toFixed(1);
        badge = `<div class="card-sync-badge retrying">
          <span class="csb-dot"></span>
          Retrying ${attempt}/${totalAttempts} — ${sec}s backoff
        </div>`;
      } else if (machineState === SYNC_STATES.SYNCING) {
        badge = `<div class="card-sync-badge syncing">
          <span class="csb-dot"></span>
          Checking stock...
        </div>`;
      } else if (machineState === SYNC_STATES.FAILED) {
        badge = `<div class="card-sync-badge failed">
          <span class="csb-dot"></span>
          Last verified snapshot
        </div>`;
      } else {
        badge = `<div class="card-sync-badge live">
          <span class="csb-dot"></span>
          Live · Verified
        </div>`;
      }

      const isWaiting = machineState === SYNC_STATES.RETRYING || machineState === SYNC_STATES.SYNCING;

      return `
        <article class="product-card${isWaiting ? ' card-waiting' : ''}">
          <div>
            <div class="product-header">
              <span class="product-sku">${item.sku}</span>
              <span class="badge-status ${statusClass}">${item.status}</span>
            </div>
            <h3 class="product-title">${item.name}</h3>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
              <span style="font-size:.78rem;color:var(--text-muted);">${item.category}</span>
              <span class="product-price">KSh ${item.price.toLocaleString()}</span>
            </div>
            ${badge}
            <div class="stock-meter-container">
              <div class="stock-meter-labels">
                <span>Available: <strong>${avail}</strong> / ${total}</span>
                <span>Reserved: ${item.reserved}</span>
              </div>
              <div class="stock-progress-bar">
                <div class="stock-progress-fill ${progressClass}" style="width:${percent}%;"></div>
              </div>
            </div>
          </div>
          <div class="warehouse-breakdown">
            <span style="color:var(--text-muted);font-weight:500;">Hub Distribution:</span>
            <div class="warehouse-tags">${warehouseTags}</div>
          </div>
        </article>`;
    }).join('');
  }

  // ── SYNC SERVICE subscriber (metrics + initial render) ────────────────────
  syncService.subscribe((state, items) => {
    if (items) {
      if (metricTotalSkus) metricTotalSkus.textContent = items.length;
      if (metricInStock)   metricInStock.textContent   = items.filter(i => i.status === 'In Stock').length;
      if (metricLowStock)  metricLowStock.textContent  = items.filter(i => i.status === 'Low Stock').length;
      renderInventory(items);
    }
  });

  // ── SEARCH — triggers a live sync on every keystroke after 300ms ──────────
  let searchDebounce = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      renderCurrentView(); // instant local filter
      searchDebounce = setTimeout(() => {
        // Trigger a real sync so the retry machinery fires
        machine.reset();
        syncService.performSync(true);
      }, 300);
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
      renderCurrentView();
      machine.reset();
      syncService.performSync(true);
    });
  }

  // ── ACTION BUTTONS ─────────────────────────────────────────────────────────
  if (btnForceSync) {
    btnForceSync.addEventListener('click', () => {
      machine.reset();
      syncService.performSync(true);
    });
  }

  if (btnTestRetry) {
    btnTestRetry.addEventListener('click', () => {
      machine.reset();
      syncService.performSync(true);
    });
  }

  if (btnFallbackRetry) {
    btnFallbackRetry.addEventListener('click', () => {
      machine.reset();
      syncService.performSync(true);
    });
  }

  // ── SIDEBAR CONTROLS ───────────────────────────────────────────────────────
  if (inputMaxRetries) {
    inputMaxRetries.addEventListener('input', e => {
      if (lblMaxRetries) lblMaxRetries.textContent = e.target.value;
      apiClient.setRetryConfig({ maxRetries: parseInt(e.target.value, 10) });
    });
  }

  if (inputBaseDelay) {
    inputBaseDelay.addEventListener('input', e => {
      if (lblBaseDelay) lblBaseDelay.textContent = e.target.value;
      apiClient.setRetryConfig({ baseDelay: parseInt(e.target.value, 10) });
    });
  }

  if (selectJitter) {
    selectJitter.addEventListener('change', e => {
      apiClient.setRetryConfig({ jitterMode: e.target.value });
    });
  }

  if (selectSimScenario) {
    selectSimScenario.addEventListener('change', e => {
      const cfg = {
        none:    { failureRate: 0.0, forcedStatusCode: 0,   latencyMs: 0    },
        flaky:   { failureRate: 0.6, forcedStatusCode: 0,   latencyMs: 0    },
        '503':   { failureRate: 0.0, forcedStatusCode: 503, latencyMs: 0    },
        '429':   { failureRate: 0.0, forcedStatusCode: 429, latencyMs: 0    },
        latency: { failureRate: 0.0, forcedStatusCode: 0,   latencyMs: 2000 },
      };
      apiClient.setSimulationConfig(cfg[e.target.value] || cfg.none);
    });
  }

  // ── BOOT: initial render then trigger first sync ──────────────────────────
  renderCurrentView();
  syncService.startAutoSync();

  // Run one sync immediately on load so the customer experiences the full flow
  setTimeout(() => {
    machine.reset();
    syncService.performSync(true);
  }, 600);
});
