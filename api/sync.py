from http.server import BaseHTTPRequestHandler
import json
import time
import random

class BackoffConfig:
    def __init__(self, max_retries=3, base_delay=0.5, max_delay=5.0, jitter_mode="full"):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter_mode = jitter_mode

def calculate_backoff_delay(attempt, config):
    if attempt <= 1:
        return 0.0
    exp_delay = config.base_delay * (2.0 ** (attempt - 1))
    capped_delay = min(config.max_delay, exp_delay)
    if config.jitter_mode == "full":
        return random.uniform(0, capped_delay)
    return capped_delay

def execute_with_retry(func, config):
    attempt = 1
    attempts_log = []
    total_retries = 0
    total_delay = 0.0

    while attempt <= config.max_retries + 1:
        delay = calculate_backoff_delay(attempt, config)
        if delay > 0:
            time.sleep(delay)
            total_retries += 1
            total_delay += delay

        status_code, body = func()
        attempts_log.append({
            "attempt": attempt,
            "delay_sec": round(delay, 3),
            "status_code": status_code
        })

        if status_code in (408, 429, 500, 502, 503, 504):
            if attempt > config.max_retries:
                return (status_code, body), {
                    "total_attempts": attempt,
                    "total_retries": total_retries,
                    "total_delay_sec": round(total_delay, 3),
                    "attempts": attempts_log
                }
            attempt += 1
            continue
        
        return (status_code, body), {
            "total_attempts": attempt,
            "total_retries": total_retries,
            "total_delay_sec": round(total_delay, 3),
            "attempts": attempts_log
        }

def simulate_supplier_api(failure_rate=0.0, force_status=200):
    if force_status != 200 and force_status != 0:
        return force_status, {"error": f"Simulated Supplier HTTP {force_status}"}
    if failure_rate > 0 and random.random() < failure_rate:
        error_code = random.choice([503, 429, 500, 502])
        return error_code, {"error": f"Supplier API Transient Failure ({error_code})"}
    return 200, {
        "sync_id": f"sync_{int(time.time()*1000)}",
        "synced_items": 6,
        "updated_skus": ["NSR-1001", "NSR-1002", "NSR-1003", "NSR-1004", "NSR-1005", "NSR-1006"],
        "status": "SUCCESS",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        return

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            body = json.loads(post_data.decode('utf-8'))
        except Exception:
            body = {}

        max_retries = int(body.get("max_retries", 3))
        base_delay = float(body.get("base_delay", 0.5))
        jitter_mode = body.get("jitter_mode", "full")
        failure_rate = float(body.get("simulate_failure_rate", 0.0))
        force_status = int(body.get("force_status", 200))

        config = BackoffConfig(max_retries=max_retries, base_delay=base_delay, jitter_mode=jitter_mode)
        result, telemetry = execute_with_retry(
            lambda: simulate_supplier_api(failure_rate=failure_rate, force_status=force_status),
            config=config
        )
        status_code, response_data = result

        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        resp = {
            "client": "Northstar Retail Co.",
            "sprint": "Sprint 2",
            "status": "SUCCESS" if status_code == 200 else "FAILED",
            "supplier_response": response_data,
            "telemetry": telemetry
        }
        self.wfile.write(json.dumps(resp).encode('utf-8'))
        return

    def do_GET(self):
        self.do_POST()
        return
