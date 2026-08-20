"""
Vercel Serverless Function: POST /api/sync
Triggers live inventory sync with supplier APIs using retry & exponential backoff.
"""

import sys
import os
import json
import time
import random
from http.server import BaseHTTPRequestHandler

# Ensure current directory is in sys.path for Vercel module resolution
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from retry_engine import BackoffConfig, execute_with_retry
except ImportError:
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

def process_sync(body_dict):
    max_retries = int(body_dict.get("max_retries", 3))
    base_delay = float(body_dict.get("base_delay", 0.5))
    jitter_mode = body_dict.get("jitter_mode", "full")
    failure_rate = float(body_dict.get("simulate_failure_rate", 0.0))
    force_status = int(body_dict.get("force_status", 200))

    config = BackoffConfig(max_retries=max_retries, base_delay=base_delay, jitter_mode=jitter_mode)
    
    result, telemetry = execute_with_retry(
        lambda: simulate_supplier_api(failure_rate=failure_rate, force_status=force_status),
        config=config
    )
    status_code, response_data = result
    
    resp_body = {
        "client": "Northstar Retail Co.",
        "sprint": "Sprint 2",
        "status": "SUCCESS" if status_code == 200 else "FAILED",
        "supplier_response": response_data,
        "telemetry": telemetry.to_dict()
    }
    return status_code, resp_body

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

        status_code, resp_body = process_sync(body)

        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(resp_body).encode('utf-8'))

    def do_GET(self):
        self.do_POST()

def app(environ, start_response):
    body = {}
    try:
        request_body_size = int(environ.get('CONTENT_LENGTH', 0))
    except (ValueError):
        request_body_size = 0

    if request_body_size > 0:
        request_body = environ['wsgi.input'].read(request_body_size)
        try:
            body = json.loads(request_body.decode('utf-8'))
        except Exception:
            body = {}

    status_code, resp_body = process_sync(body)
    status_str = f"{status_code} OK" if status_code == 200 else f"{status_code} Error"
    start_response(status_str, [('Content-Type', 'application/json'), ('Access-Control-Allow-Origin', '*')])
    return [json.dumps(resp_body).encode('utf-8')]

application = app
