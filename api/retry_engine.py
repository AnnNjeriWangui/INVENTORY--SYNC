"""
Northstar Retail Co. - Retry & Exponential Backoff Engine
Sprint 2: Live Inventory Sync Service
"""

import time
import random
import math
from typing import Callable, Any, Dict, List, Optional, Tuple

class BackoffConfig:
    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 0.5,
        max_delay: float = 10.0,
        backoff_factor: float = 2.0,
        jitter_mode: str = "full"  # "full", "equal", "none"
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_factor = backoff_factor
        self.jitter_mode = jitter_mode

class RetryTelemetry:
    def __init__(self):
        self.attempts: List[Dict[str, Any]] = []
        self.total_retries: int = 0
        self.total_delay_sec: float = 0.0

    def record_attempt(self, attempt_num: int, delay: float, status_code: Optional[int], error_msg: Optional[str], success: bool):
        if attempt_num > 1:
            self.total_retries += 1
            self.total_delay_sec += delay
            
        self.attempts.append({
            "attempt": attempt_num,
            "delay_sec": round(delay, 3),
            "status_code": status_code,
            "error": error_msg,
            "success": success,
            "timestamp": time.time()
        })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_attempts": len(self.attempts),
            "total_retries": self.total_retries,
            "total_delay_sec": round(self.total_delay_sec, 3),
            "attempts": self.attempts
        }

def calculate_backoff_delay(attempt: int, config: BackoffConfig) -> float:
    """
    Calculates exponential backoff delay with optional full/equal jitter.
    Formula: delay = min(max_delay, base_delay * (backoff_factor ^ (attempt - 1)))
    """
    if attempt <= 1:
        return 0.0
    
    # Calculate base exponential delay
    exp_delay = config.base_delay * (config.backoff_factor ** (attempt - 1))
    capped_delay = min(config.max_delay, exp_delay)

    if config.jitter_mode == "full":
        # Full Jitter: random between 0 and capped_delay
        return random.uniform(0, capped_delay)
    elif config.jitter_mode == "equal":
        # Equal Jitter: half deterministic delay + half random jitter
        half_delay = capped_delay / 2.0
        return half_delay + random.uniform(0, half_delay)
    else:
        # No Jitter: exact exponential delay
        return capped_delay

def execute_with_retry(
    func: Callable[[], Any],
    config: Optional[BackoffConfig] = None,
    retryable_status_codes: Tuple[int, ...] = (408, 429, 500, 502, 503, 504)
) -> Tuple[Any, RetryTelemetry]:
    """
    Executes a callable with automatic retry and exponential backoff.
    """
    if config is None:
        config = BackoffConfig()

    telemetry = RetryTelemetry()
    attempt = 1
    last_exception = None

    while attempt <= config.max_retries + 1:
        delay = calculate_backoff_delay(attempt, config)
        if delay > 0:
            time.sleep(delay)

        try:
            result = func()
            
            # Check if result is an HTTP-like response tuple (status_code, body)
            if isinstance(result, tuple) and len(result) >= 2 and isinstance(result[0], int):
                status_code = result[0]
                if status_code in retryable_status_codes:
                    telemetry.record_attempt(attempt, delay, status_code, f"HTTP Status {status_code}", False)
                    if attempt > config.max_retries:
                        return result, telemetry
                    attempt += 1
                    continue
                else:
                    telemetry.record_attempt(attempt, delay, status_code, None, True)
                    return result, telemetry

            telemetry.record_attempt(attempt, delay, 200, None, True)
            return result, telemetry

        except Exception as exc:
            last_exception = exc
            telemetry.record_attempt(attempt, delay, None, str(exc), False)
            
            if attempt > config.max_retries:
                raise exc
            
            attempt += 1

    if last_exception:
        raise last_exception
    raise RuntimeError("Retry loop exhausted without result")
