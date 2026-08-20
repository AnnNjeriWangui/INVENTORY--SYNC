/**
 * Northstar Retail Co. - Retry & Exponential Backoff Handler (Client-Side)
 * Sprint 2: Live Inventory Sync Service
 */

export class RetryBackoffHandler {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries ?? 3;
        this.baseDelay = options.baseDelay ?? 500; // ms
        this.maxDelay = options.maxDelay ?? 8000;  // ms
        this.backoffFactor = options.backoffFactor ?? 2.0;
        this.jitterMode = options.jitterMode || 'full'; // 'full', 'equal', 'none'
        this.retryableStatusCodes = options.retryableStatusCodes || [408, 429, 500, 502, 503, 504];
        this.onAttempt = options.onAttempt || null;
    }

    /**
     * Calculates delay for a given attempt number (1-indexed)
     */
    calculateDelay(attempt) {
        if (attempt <= 1) return 0;

        const exponentialDelay = this.baseDelay * Math.pow(this.backoffFactor, attempt - 2);
        const cappedDelay = Math.min(this.maxDelay, exponentialDelay);

        if (this.jitterMode === 'full') {
            return Math.floor(Math.random() * cappedDelay);
        } else if (this.jitterMode === 'equal') {
            const half = cappedDelay / 2;
            return Math.floor(half + (Math.random() * half));
        } else {
            return Math.floor(cappedDelay);
        }
    }

    /**
     * Determines whether an error or status code is retryable
     */
    isRetryable(error, status) {
        if (status && this.retryableStatusCodes.includes(status)) {
            return true;
        }
        if (error && (error.name === 'TypeError' || error.name === 'FetchError' || error.message.includes('network'))) {
            return true;
        }
        return false;
    }

    /**
     * High-resolution countdown delay with live UI tick callbacks
     */
    async sleepWithCountdown(delayMs, attempt, maxRetries) {
        const startTime = Date.now();
        const tickInterval = 50; // ms

        if (this.onAttempt) {
            this.onAttempt({
                type: 'BACKOFF_START',
                attempt,
                maxRetries,
                delayMs,
                remainingMs: delayMs,
                progressPercent: 0
            });
        }

        while (Date.now() - startTime < delayMs) {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, delayMs - elapsed);
            const percent = Math.min(100, Math.round((elapsed / delayMs) * 100));

            if (this.onAttempt) {
                this.onAttempt({
                    type: 'BACKOFF_TICK',
                    attempt,
                    maxRetries,
                    delayMs,
                    remainingMs: remaining,
                    progressPercent: percent
                });
            }

            await new Promise(res => setTimeout(res, tickInterval));
        }

        if (this.onAttempt) {
            this.onAttempt({
                type: 'BACKOFF_COMPLETE',
                attempt,
                maxRetries,
                delayMs,
                remainingMs: 0,
                progressPercent: 100
            });
        }
    }

    /**
     * Executes an async task with automatic retries, exponential backoff, and live UI binding callbacks
     */
    async execute(asyncTask) {
        let attempt = 1;
        const totalAttemptsMax = this.maxRetries + 1;
        const telemetry = {
            startTime: Date.now(),
            attempts: [],
            totalRetries: 0,
            totalDelayMs: 0
        };

        while (attempt <= totalAttemptsMax) {
            const delay = this.calculateDelay(attempt);
            if (delay > 0) {
                telemetry.totalRetries++;
                telemetry.totalDelayMs += delay;
                await this.sleepWithCountdown(delay, attempt, this.maxRetries);
            }

            const attemptStart = Date.now();
            try {
                if (this.onAttempt) {
                    this.onAttempt({
                        type: 'ATTEMPT_START',
                        attempt,
                        maxRetries: this.maxRetries,
                        totalAttemptsMax
                    });
                }

                const result = await asyncTask(attempt);
                const duration = Date.now() - attemptStart;

                const status = result && typeof result.status === 'number' ? result.status : 200;
                
                if (status >= 400 && this.isRetryable(null, status)) {
                    const errRecord = {
                        attempt,
                        delayMs: delay,
                        durationMs: duration,
                        status,
                        error: `HTTP Error ${status}`,
                        timestamp: new Date().toISOString()
                    };
                    telemetry.attempts.push(errRecord);

                    if (this.onAttempt) {
                        this.onAttempt({
                            type: 'ATTEMPT_FAILED',
                            attempt,
                            status,
                            error: `HTTP ${status}`,
                            maxRetries: this.maxRetries,
                            willRetry: attempt <= this.maxRetries
                        });
                    }

                    if (attempt > this.maxRetries) {
                        if (this.onAttempt) {
                            this.onAttempt({
                                type: 'RETRY_EXHAUSTED',
                                attempt,
                                maxRetries: this.maxRetries,
                                error: `Exhausted retries after ${attempt} attempts (HTTP ${status})`
                            });
                        }
                        return { success: false, status, result, telemetry, error: `Exhausted retries after ${attempt} attempts (HTTP ${status})` };
                    }
                    attempt++;
                    continue;
                }

                // Success
                const successRecord = {
                    attempt,
                    delayMs: delay,
                    durationMs: duration,
                    status,
                    timestamp: new Date().toISOString()
                };
                telemetry.attempts.push(successRecord);

                if (this.onAttempt) {
                    this.onAttempt({
                        type: 'ATTEMPT_SUCCESS',
                        attempt,
                        maxRetries: this.maxRetries,
                        status,
                        durationMs: duration
                    });
                }

                return { success: true, status, result, telemetry };

            } catch (err) {
                const duration = Date.now() - attemptStart;
                const errRecord = {
                    attempt,
                    delayMs: delay,
                    durationMs: duration,
                    status: err.status || 0,
                    error: err.message,
                    timestamp: new Date().toISOString()
                };
                telemetry.attempts.push(errRecord);

                if (this.onAttempt) {
                    this.onAttempt({
                        type: 'ATTEMPT_FAILED',
                        attempt,
                        status: err.status || 0,
                        error: err.message,
                        maxRetries: this.maxRetries,
                        willRetry: attempt <= this.maxRetries && this.isRetryable(err, err.status)
                    });
                }

                if (attempt > this.maxRetries || !this.isRetryable(err, err.status)) {
                    if (this.onAttempt) {
                        this.onAttempt({
                            type: 'RETRY_EXHAUSTED',
                            attempt,
                            maxRetries: this.maxRetries,
                            error: err.message
                        });
                    }
                    return { success: false, status: err.status || 0, telemetry, error: err.message };
                }
                attempt++;
            }
        }

        if (this.onAttempt) {
            this.onAttempt({
                type: 'RETRY_EXHAUSTED',
                attempt: this.maxRetries + 1,
                maxRetries: this.maxRetries,
                error: 'Maximum retry attempts reached'
            });
        }
        return { success: false, telemetry, error: 'Maximum retry attempts reached' };
    }
}
