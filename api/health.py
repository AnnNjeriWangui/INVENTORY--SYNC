"""
Vercel Serverless Function: GET /api/health
Health check endpoint for Northstar Retail Co live inventory sync service.
"""

from http.server import BaseHTTPRequestHandler
import json
import time

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "status": "healthy",
            "service": "Northstar Retail Co. Inventory Sync Service",
            "sprint": "Sprint 2",
            "retry_engine": "active",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        self.wfile.write(json.dumps(response).encode('utf-8'))

def app(environ, start_response):
    status = '200 OK'
    headers = [
        ('Content-Type', 'application/json'),
        ('Access-Control-Allow-Origin', '*')
    ]
    start_response(status, headers)
    response = {
        "status": "healthy",
        "service": "Northstar Retail Co. Inventory Sync Service",
        "sprint": "Sprint 2",
        "retry_engine": "active",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    return [json.dumps(response).encode('utf-8')]

application = app
