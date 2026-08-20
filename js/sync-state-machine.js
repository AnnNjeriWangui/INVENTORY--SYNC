/**
 * Northstar Retail Co. - Explicit UI-Driven Sync State Machine
 * Sprint 2: Live Inventory Sync Service
 *
 * States:
 *   idle     → system ready, no operation in flight
 *   syncing  → first attempt firing, no prior failure
 *   retrying → a previous attempt failed; backoff delay + re-attempt in progress
 *   success  → latest attempt resolved successfully
 *   failed   → all retries exhausted, showing last verified snapshot
 */

export const SYNC_STATES = Object.freeze({
  IDLE:      'idle',
  SYNCING:   'syncing',
  RETRYING:  'retrying',
  SUCCESS:   'success',
  FAILED:    'failed',
});

export class SyncStateMachine {
  constructor() {
    /** @type {'idle'|'syncing'|'retrying'|'success'|'failed'} */
    this.state = SYNC_STATES.IDLE;

    /** Full snapshot of the latest context for any subscriber joining late */
    this.context = {
      attempt:          0,
      maxRetries:       3,
      totalAttempts:    4,   // maxRetries + 1
      delayMs:          0,
      remainingMs:      0,
      progressPercent:  0,
      error:            null,
      lastSuccessTime:  null,
      retriesHandled:   0,
    };

    /** @type {Array<(state: string, context: object) => void>} */
    this._listeners = [];

    // Allowed transitions — enforces correctness
    this._transitions = {
      [SYNC_STATES.IDLE]:      [SYNC_STATES.SYNCING],
      [SYNC_STATES.SYNCING]:   [SYNC_STATES.RETRYING, SYNC_STATES.SUCCESS, SYNC_STATES.FAILED],
      [SYNC_STATES.RETRYING]:  [SYNC_STATES.RETRYING, SYNC_STATES.SUCCESS, SYNC_STATES.FAILED, SYNC_STATES.SYNCING],
      [SYNC_STATES.SUCCESS]:   [SYNC_STATES.SYNCING, SYNC_STATES.IDLE],
      [SYNC_STATES.FAILED]:    [SYNC_STATES.SYNCING, SYNC_STATES.IDLE],
    };
  }

  /** Subscribe to every state transition */
  subscribe(fn) {
    this._listeners.push(fn);
    // Immediately deliver current state to late subscribers
    fn(this.state, { ...this.context });
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  /** Transition to a new state with optional context patch */
  transition(nextState, contextPatch = {}) {
    const allowed = this._transitions[this.state];
    if (!allowed || !allowed.includes(nextState)) {
      console.warn(`[SyncStateMachine] Illegal transition: ${this.state} → ${nextState}`);
      return;
    }

    this.state = nextState;
    this.context = { ...this.context, ...contextPatch };

    // Notify all listeners synchronously
    const snapshot = { ...this.context };
    this._listeners.forEach(fn => fn(nextState, snapshot));
  }

  // ─── Convenience helpers for each lifecycle event ────────────────────────

  /** Call when first attempt is about to fire (no prior failures yet) */
  startSync(maxRetries) {
    const totalAttempts = maxRetries + 1;
    this.transition(SYNC_STATES.SYNCING, {
      attempt: 1,
      maxRetries,
      totalAttempts,
      delayMs: 0,
      remainingMs: 0,
      progressPercent: 0,
      error: null,
    });
  }

  /** Call during BACKOFF_TICK — attempt N is waiting before re-firing */
  tickBackoff({ attempt, maxRetries, delayMs, remainingMs, progressPercent }) {
    const totalAttempts = maxRetries + 1;
    const nextState = SYNC_STATES.RETRYING;

    // Allow re-entry into RETRYING for tick updates
    if (this.state !== SYNC_STATES.RETRYING) {
      this.transition(nextState, {
        attempt, maxRetries, totalAttempts,
        delayMs, remainingMs, progressPercent, error: null,
      });
    } else {
      // Update context in place without going through transition guard
      this.context = {
        ...this.context,
        attempt, maxRetries, totalAttempts,
        delayMs, remainingMs, progressPercent,
      };
      // Still notify listeners so the countdown live-updates
      const snapshot = { ...this.context };
      this._listeners.forEach(fn => fn(SYNC_STATES.RETRYING, snapshot));
    }
  }

  /** Call when an attempt succeeds */
  markSuccess(durationMs) {
    this.transition(SYNC_STATES.SUCCESS, {
      lastSuccessTime: new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      progressPercent: 100,
      remainingMs: 0,
      error: null,
    });
  }

  /** Call when all retries are exhausted */
  markFailed(error) {
    this.transition(SYNC_STATES.FAILED, {
      retriesHandled: this.context.retriesHandled,
      error,
      remainingMs: 0,
      progressPercent: 0,
    });
  }

  /** Reset back to idle (e.g. after user dismisses fallback) */
  reset() {
    // Allow reset from any state
    this._transitions[this.state] = [SYNC_STATES.IDLE, SYNC_STATES.SYNCING];
    this.transition(SYNC_STATES.IDLE, {
      attempt: 0, delayMs: 0, remainingMs: 0, progressPercent: 0, error: null,
    });
  }
}
