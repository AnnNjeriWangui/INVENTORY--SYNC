/**
 * Northstar Retail Co. - Main Application Controller
 * Sprint 2: Live Inventory Sync Service
 *
 * Architecture: all UI updates are driven exclusively by the SyncStateMachine.
 * No component reads retry state directly — it subscribes to state transitions.
 */

import { InventoryApiClient }    from './api-client.js';
import { LiveInventorySyncService } from './sync-service.js';
import { SyncStateMachine, SYNC_STATES } from './sync-state-machine.js';

document.addEventListener('DOMContentLoaded', () => {

  // ─── Core instances ────────────────────────────────────────────────────────
  const apiClient  = new InventoryApiClient();
  const syncService = new LiveInventorySyncService(apiClient, { syncIntervalMs: 20000 });
  const machine    = new SyncStateMachine();          // ← the UI state machine

  // ─── DOM references ────────────────────────────────────────────────────────
  const inventoryGrid      = document.getElementById('inventoryGrid');
  const gridOverlay        = document.getElementById('gridSyncOverlay');
  const searchInput        = document.getElementById('searchInput');
  const categoryFilter     = document.getElementById('categoryFilter');
  const btnForceSync       = document.getElementById('btnForceSync');
  const btnTestRetry       = document.getElementById('btnTestRetry');

  // Header status
  const pulseDot           = document.getElementById('pulseDot');
  const syncStatusText     = document.getElementById('syncStatusText');
  const lastSyncTimestamp  = document.getElementById('lastSyncTimestamp');

  // Metric counters
  const metricTotalSkus    = document.getElementById('metricTotalSkus');
  const metricInStock      = document.getElementById('metricInStock');
  const metricLowStock     = document.getElementById('metricLowStock');
  const metricRetriesCount = document.getElementById('metricRetriesCount');

  // State machine status strip (below metrics)
  const smStatePill        = document.getElementById('smStatePill');
  const smStateLabel       = document.getElementById('smStateLabel');

  // Retry/backoff banner
  const retryBanner        = document.getElementById('userRetryBanner');
  const bannerStatusText   = document.getElementById('bannerStatusText');
  const bannerAttemptBadge = document.getElementById('bannerAttemptBadge');
  const bannerCountdownMsg = document.getElementById('bannerCountdownMsg');
  const bannerCountdownTime= document.getElementById('bannerCountdownTime');
  const backoffProgressFill= document.getElementById('backoffProgressFill');

  // Fallback card
  const fallbackCard       = document.getElementById('customerFallbackCard');
  const btnFallbackRetry   = document.getElementById('btnFallbackRetry');
  const btnDismissFallback = document.getElementById('btnDismissFallback');

  // Sidebar controls
  const inputMaxRetries    = document.getElementById('inputMaxRetries');
  const lblMaxRetries      = document.getElementById('lblMaxRetries');
  const inputBaseDelay     = document.getElementById('inputBaseDelay');
  const lblBaseDelay       = document.getElementById('lblBaseDelay');
  const selectJitter       = document.getElementById('selectJitter');
  const selectSimScenario  = document.getElementById('selectSimScenario');

  // ─── LOCAL state (for card badge rendering only) ───────────────────────────
  let machineState   = SYNC_STATES.IDLE;
  let machineContext = {};

  // ─── State Machine → UI Observer ──────────────────────────────────────────
  //
  // This is the SINGLE place that all visual changes come from.
  // Each case maps one state to a complete, declarative UI snapshot.
  //
  machine.subscribe((state, ctx) => {
    machineState   = state;
    machineContext = ctx;

    switch (state) {

      // ── IDLE ──────────────────────────────────────────────────────────────
      case SYNC_STATES.IDLE:
        setPulseDot('idle');
        setSyncText('Sync Engine Ready');
        setStatePill('idle', 'Idle');
        hideBanner();
        hideFallback();
        setGridOverlay(false);
        break;

      // ── SYNCING ───────────────────────────────────────────────────────────
      case SYNC_STATES.SYNCING:
        setPulseDot('syncing');
        setSyncText('Connecting to hubs...');
        setStatePill('syncing', 'Syncing');
        hideBanner();
        hideFallback();
        setGridOverlay(false);   // first attempt — no lockout yet
        break;

      // ── RETRYING ─────────────────────────────────────────────────────────
      case SYNC_STATES.RETRYING: {
        const { attempt, totalAttempts, delayMs, remainingMs, progressPercent } = ctx;
        const remSec  = (remainingMs / 1000).toFixed(1);
        const delSec  = (delayMs     / 1000).toFixed(1);

        setPulseDot('retrying');
        setSyncText(`Retrying attempt ${attempt} of ${totalAttempts}...`);
        setStatePill('retrying', `Retry ${attempt}/${totalAttempts}`);

        // Show banner with live countdown
        showBanner();
        if (bannerStatusText)
          bannerStatusText.textContent =
            `Connection slow. Retrying attempt ${attempt} of ${totalAttempts}`;
        if (bannerAttemptBadge)
          bannerAttemptBadge.textContent = `Attempt ${attempt} of ${totalAttempts}`;
        if (bannerCountdownMsg)
          bannerCountdownMsg.textContent =
            `Backoff delay: ${delSec}s (exponential + jitter) — waiting before re-sending...`;
        if (bannerCountdownTime)
          bannerCountdownTime.textContent =
            remainingMs > 0 ? `${remSec}s remaining` : 'Firing now...';
        if (backoffProgressFill)
          backoffProgressFill.style.width = `${progressPercent}%`;

        // Lock the inventory grid with overlay while retry is in-flight
        setGridOverlay(true, attempt, totalAttempts, remSec);

        hideFallback();
        break;
      }

      // ── SUCCESS ───────────────────────────────────────────────────────────
      case SYNC_STATES.SUCCESS:
        setPulseDot('success');
        setSyncText('Live Sync Active');
        setStatePill('success', 'Synced ✓');
        if (lastSyncTimestamp)
          lastSyncTimestamp.textContent = `Last Sync: ${ctx.lastSuccessTime || 'Just now'}`;

        // Flash banner briefly then hide
        if (bannerStatusText)
          bannerStatusText.textContent = `✓ Successfully synced with all regional distribution hubs`;
        if (backoffProgressFill)
          backoffProgressFill.style.width = '100%';
        showBanner();
        setTimeout(() => hideBanner(), 1200);

        setGridOverlay(false);
        hideFallback();

        // After 2s return to idle
        setTimeout(() => machine.reset(), 2000);
        break;

      // ── FAILED ────────────────────────────────────────────────────────────
      case SYNC_STATES.FAILED:
        setPulseDot('error');
        setSyncText('Sync Failed — Offline Snapshot Active');
        setStatePill('failed', 'Failed');
        hideBanner();
        setGridOverlay(false);
        showFallback();
        break;
    }

    // Re-render inventory cards so their per-card badge reflects current state
    renderCurrentView();
  });

  // ─── Telemetry → State Machine ─────────────────────────────────────────────
  //
  // The apiClient fires raw retry events. We translate them into
  // state machine transitions here — this is the only bridge point.
  //
  apiClient.onTelemetry((event) => {
    switch (event.type) {

      case 'ATTEMPT_START':
        if (event.attempt === 1) {
          machine.startSync(event.maxRetries);
        }
        // attempt > 1 is handled by BACKOFF_START/TICK before ATTEMPT_START fires
        break;

      case 'BACKOFF_START':
      case 'BACKOFF_TICK':
        machine.tickBackoff({
          attempt:         event.attempt,
          maxRetries:      event.maxRetries,
          delayMs:         event.delayMs,
          remainingMs:     event.remainingMs,
          progressPercent: event.progressPercent,
        });
        // Increment running total displayed in metrics card
        if (event.type === 'BACKOFF_START' && metricRetriesCount) {
          metricRetriesCount.textContent =
            String(parseInt(metricRetriesCount.textContent || '0', 10) + 1);
        }
        break;

      case 'ATTEMPT_SUCCESS':
        machine.markSuccess(event.durationMs);
        break;

      case 'RETRY_EXHAUSTED':
        machine.markFailed(event.error || 'All retry attempts exhausted');
        break;
    }
  });

  // ─── UI Helper Functions ────────────────────────────────────────────────────

  /** State → pulse dot CSS class */
  function setPulseDot(variant) {
    if (!pulseDot) return;
    pulseDot.className = `pulse-dot${variant !== 'idle' ? ` ${variant}` : ''}`;
  }

  function setSyncText(text) {
    if (syncStatusText) syncStatusText.textContent = text;
  }

  /** Update the compact state machine status pill */
  function setStatePill(state, label) {
    if (!smStatePill || !smStateLabel) return;
    smStatePill.dataset.state = state;
    smStateLabel.textContent  = label;
  }

  function showBanner() { if (retryBanner) retryBanner.classList.remove('hidden'); }
  function hideBanner()  { if (retryBanner) retryBanner.classList.add('hidden'); }
  function showFallback(){ if (fallbackCard) fallbackCard.classList.remove('hidden'); }
  function hideFallback(){ if (fallbackCard) fallbackCard.classList.add('hidden'); }

  /**
   * Enable / disable the grid overlay that visually "locks" the catalog
   * during a retry, so the user can see it is waiting — not stale.
   */
  function setGridOverlay(active, attempt, totalAttempts, remSec) {
    if (!gridOverlay) return;
    if (!active) {
      gridOverlay.classList.add('hidden');
      return;
    }
    gridOverlay.classList.remove('hidden');
    const overlayMsg = gridOverlay.querySelector('#overlayRetryMsg');
    const overlaySub = gridOverlay.querySelector('#overlayRetrySub');
    if (overlayMsg)
      overlayMsg.textContent =
        `Retrying attempt ${attempt} of ${totalAttempts}...`;
    if (overlaySub)
      overlaySub.textContent =
        remSec > 0
          ? `Exponential backoff — ${remSec}s until next attempt`
          : 'Firing next request...';
  }

  // ─── Inventory Rendering ────────────────────────────────────────────────────

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
        <div style="grid-column:1/-1;padding:2.5rem;text-align:center;color:var(--text-muted);">
          No matching products found.
        </div>`;
      return;
    }

    inventoryGrid.innerHTML = items.map(item => {
      let statusClass   = 'in-stock';
      let progressClass = 'fill-in-stock';
      if (item.status === 'Low Stock')    { statusClass = 'low-stock';   progressClass = 'fill-low-stock'; }
      if (item.status === 'Out of Stock') { statusClass = 'out-of-stock';progressClass = 'fill-out-stock';}

      const total   = item.total_stock || 0;
      const avail   = item.available   || 0;
      const percent = Math.min(100, Math.round((avail / (total || 1)) * 100));

      const warehouseTags = item.warehouses
        ? Object.entries(item.warehouses)
            .map(([wh, n]) => `<span class="wh-tag">${wh}: <strong>${n}</strong></span>`)
            .join('')
        : '';

      // Per-card backoff state badge — driven by machine state
      let badgeMarkup = '';
      if (machineState === SYNC_STATES.RETRYING) {
        const { attempt, totalAttempts, remainingMs } = machineContext;
        const sec = (remainingMs / 1000).toFixed(1);
        badgeMarkup = `
          <div class="card-retry-badge retry-active">
            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Retrying ${attempt}/${totalAttempts} — ${sec}s backoff
          </div>`;
      } else if (machineState === SYNC_STATES.SYNCING) {
        badgeMarkup = `
          <div class="card-retry-badge" style="background:#EFF6FF;border-color:#3B82F6;color:#1D4ED8;">
            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9"/>
            </svg>
            Syncing...
          </div>`;
      } else if (machineState === SYNC_STATES.FAILED) {
        badgeMarkup = `
          <div class="card-retry-badge fallback-mode">
            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Last Verified Snapshot
          </div>`;
      } else {
        badgeMarkup = `
          <div class="card-retry-badge">
            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            Live Synced
          </div>`;
      }

      return `
        <article class="product-card${machineState === SYNC_STATES.RETRYING ? ' card-waiting' : ''}">
          <div>
            <div class="product-header">
              <span class="product-sku">${item.sku}</span>
              <span class="badge-status ${statusClass}">${item.status}</span>
            </div>
            <h3 class="product-title">${item.name}</h3>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem;">
              <span style="font-size:.78rem;color:var(--text-muted);">${item.category}</span>
              <span class="product-price">KSh ${item.price.toLocaleString()}</span>
            </div>
            ${badgeMarkup}
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
            <span style="color:var(--text-muted);font-weight:500;">Warehouse Distribution:</span>
            <div class="warehouse-tags">${warehouseTags}</div>
          </div>
        </article>`;
    }).join('');
  }

  // ─── Sync Service subscriber (metrics + initial render) ────────────────────
  syncService.subscribe((state, items) => {
    if (items) {
      if (metricTotalSkus) metricTotalSkus.textContent = items.length;
      const inStock  = items.filter(i => i.status === 'In Stock').length;
      const lowStock = items.filter(i => i.status === 'Low Stock').length;
      if (metricInStock)  metricInStock.textContent  = inStock;
      if (metricLowStock) metricLowStock.textContent = lowStock;
      renderInventory(items);
    }
  });

  // ─── Search / filter ────────────────────────────────────────────────────────
  if (searchInput) {
    searchInput.addEventListener('input', renderCurrentView);
  }
  if (categoryFilter) {
    categoryFilter.addEventListener('change', renderCurrentView);
  }

  // ─── Action buttons ────────────────────────────────────────────────────────
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

  if (btnDismissFallback) {
    btnDismissFallback.addEventListener('click', () => {
      machine.reset();
      hideFallback();
    });
  }

  // ─── Sidebar control bindings ──────────────────────────────────────────────
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
      const v = e.target.value;
      const cfg = {
        none:    { failureRate: 0.0, forcedStatusCode: 0,   latencyMs: 0    },
        flaky:   { failureRate: 0.5, forcedStatusCode: 0,   latencyMs: 0    },
        '503':   { failureRate: 0.0, forcedStatusCode: 503, latencyMs: 0    },
        '429':   { failureRate: 0.0, forcedStatusCode: 429, latencyMs: 0    },
        latency: { failureRate: 0.0, forcedStatusCode: 0,   latencyMs: 2000 },
      };
      apiClient.setSimulationConfig(cfg[v] || cfg.none);
    });
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────
  syncService.startAutoSync();
});
