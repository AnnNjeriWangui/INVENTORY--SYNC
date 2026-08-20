"""
Unit Tests for Northstar Retail Co. Retry & Exponential Backoff Engine
"""

import unittest
import time
from api.retry_engine import BackoffConfig, calculate_backoff_delay, execute_with_retry

class TestRetryBackoffEngine(unittest.TestCase):

    def test_backoff_delay_calculation(self):
        config = BackoffConfig(
            max_retries=4,
            base_delay=1.0,
            max_delay=10.0,
            backoff_factor=2.0,
            jitter_mode="none"
        )
        
        # Attempt 1 -> 0 delay
        self.assertEqual(calculate_backoff_delay(1, config), 0.0)
        # Attempt 2 -> 1.0 * (2.0^1) = 2.0
        self.assertEqual(calculate_backoff_delay(2, config), 2.0)
        # Attempt 3 -> 1.0 * (2.0^2) = 4.0
        self.assertEqual(calculate_backoff_delay(3, config), 4.0)
        # Attempt 4 -> 1.0 * (2.0^3) = 8.0
        self.assertEqual(calculate_backoff_delay(4, config), 8.0)
        # Attempt 5 -> capped at 10.0
        self.assertEqual(calculate_backoff_delay(5, config), 10.0)

    def test_full_jitter_bounds(self):
        config = BackoffConfig(
            max_retries=3,
            base_delay=1.0,
            max_delay=8.0,
            backoff_factor=2.0,
            jitter_mode="full"
        )
        for _ in range(50):
            delay = calculate_backoff_delay(3, config)
            # max exp delay for attempt 3 is 4.0
            self.assertTrue(0.0 <= delay <= 4.0)

    def test_successful_execution_on_first_try(self):
        config = BackoffConfig(max_retries=3, base_delay=0.01)
        calls = []

        def sample_func():
            calls.append(1)
            return 200, {"status": "ok"}

        result, telemetry = execute_with_retry(sample_func, config=config)
        self.assertEqual(len(calls), 1)
        self.assertEqual(telemetry.total_retries, 0)
        self.assertEqual(result[0], 200)

    def test_successful_execution_after_retry(self):
        config = BackoffConfig(max_retries=3, base_delay=0.01, jitter_mode="none")
        attempts = 0

        def flaky_func():
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                return 503, {"error": "Service Unavailable"}
            return 200, {"status": "synced"}

        result, telemetry = execute_with_retry(flaky_func, config=config)
        self.assertEqual(attempts, 3)
        self.assertEqual(telemetry.total_retries, 2)
        self.assertEqual(result[0], 200)

    def test_exhausted_retries(self):
        config = BackoffConfig(max_retries=2, base_delay=0.01, jitter_mode="none")
        attempts = 0

        def always_failing():
            nonlocal attempts
            attempts += 1
            return 503, {"error": "Service Unavailable"}

        result, telemetry = execute_with_retry(always_failing, config=config)
        # Attempt 1, Retry 1 (att 2), Retry 2 (att 3) -> 3 total attempts
        self.assertEqual(attempts, 3)
        self.assertEqual(telemetry.total_retries, 2)
        self.assertEqual(result[0], 503)

if __name__ == "__main__":
    unittest.main()
