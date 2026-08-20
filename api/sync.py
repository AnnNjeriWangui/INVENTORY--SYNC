"""
Vercel Serverless Function: POST /api/sync
Triggers live inventory sync with supplier APIs using retry & exponential backoff.
"""

import json
import time
import random
from http.server import BaseHTTPRequestHandler
from api.retry_engine import BackoffConfig, execute_with_retry

def simulate_supplier_api(failure_rate: float = 0.0, force_status: int = 200):
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
            "telemetry": telemetry.to_dict()
        }
        self.wfile.write(json.dumps(resp).encode('utf-8'))

    def do_GET(self):
        self.do_POST()
