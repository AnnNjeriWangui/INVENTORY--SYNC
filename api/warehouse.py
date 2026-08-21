"""
Northstar Retail Co. - Mock Warehouse API Serverless Endpoint
Day 3: Distributed Regional Hub Stock Availability Provider
"""

from http.server import BaseHTTPRequestHandler
import json
import time
from urllib.parse import parse_qs, urlparse

WAREHOUSE_HUBS = [
    {"id": "WH-NBO", "name": "Nairobi Central Hub", "location": "Nairobi, Kenya", "status": "OPERATIONAL", "latency_ms": 18},
    {"id": "WH-MBA", "name": "Mombasa Port Hub", "location": "Mombasa, Kenya", "status": "OPERATIONAL", "latency_ms": 24},
    {"id": "WH-KSM", "name": "Kisumu Lake Hub", "location": "Kisumu, Kenya", "status": "OPERATIONAL", "latency_ms": 32},
    {"id": "WH-NKR", "name": "Nakuru Express", "location": "Nakuru, Kenya", "status": "OPERATIONAL", "latency_ms": 28},
    {"id": "WH-ELD", "name": "Eldoret Depot", "location": "Eldoret, Kenya", "status": "OPERATIONAL", "latency_ms": 35}
]

WAREHOUSE_INVENTORY = [
    {
        "sku": "NSR-1001",
        "name": "Northstar Summit Waterproof Parka",
        "category": "Outerwear",
        "price": 24500,
        "total_stock": 42,
        "reserved": 5,
        "available": 37,
        "status": "In Stock",
        "warehouses": {
            "Nairobi Hub": 18,
            "Mombasa Hub": 12,
            "Kisumu Hub": 7,
            "Nakuru Express": 5
        },
        "last_sync": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    },
    {
        "sku": "NSR-1002",
        "name": "Cascade Ergonomic Support Backpack 30L",
        "category": "Accessories",
        "price": 16800,
        "total_stock": 6,
        "reserved": 4,
        "available": 2,
        "status": "Low Stock",
        "warehouses": {
            "Nairobi Hub": 2,
            "Mombasa Hub": 0,
            "Eldoret Depot": 0,
            "Kisumu Hub": 4
        },
        "last_sync": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    },
    {
        "sku": "NSR-1003",
        "name": "Glacier Thermal Base Layer (Merino Wool)",
        "category": "Apparel",
        "price": 10500,
        "total_stock": 115,
        "reserved": 10,
        "available": 105,
        "status": "In Stock",
        "warehouses": {
            "Nairobi Hub": 50,
            "Mombasa Hub": 35,
            "Kisumu Hub": 20,
            "Nakuru Express": 10
        },
        "last_sync": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    },
    {
        "sku": "NSR-1004",
        "name": "Apex Trail Running Shoes (Size 10.5)",
        "category": "Footwear",
        "price": 19900,
        "total_stock": 0,
        "reserved": 0,
        "available": 0,
        "status": "Out of Stock",
        "warehouses": {
            "Nairobi Hub": 0,
            "Mombasa Hub": 0,
            "Kisumu Hub": 0,
            "Nakuru Express": 0
        },
        "last_sync": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    },
    {
        "sku": "NSR-1005",
        "name": "Vanguard All-Terrain Hydration Vest",
        "category": "Accessories",
        "price": 11500,
        "total_stock": 24,
        "reserved": 3,
        "available": 21,
        "status": "In Stock",
        "warehouses": {
            "Nairobi Hub": 10,
            "Mombasa Hub": 8,
            "Kisumu Hub": 4,
            "Nakuru Express": 2
        },
        "last_sync": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    },
    {
        "sku": "NSR-1006",
        "name": "Polaris Insulated Stainless Tumbler 32oz",
        "category": "Gear",
        "price": 4500,
        "total_stock": 3,
        "reserved": 1,
        "available": 2,
        "status": "Low Stock",
        "warehouses": {
            "Nairobi Hub": 1,
            "Mombasa Hub": 1,
            "Eldoret Depot": 1,
            "Kisumu Hub": 0
        },
        "last_sync": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
]

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url_parts = urlparse(self.path)
        query_params = parse_qs(url_parts.query)
        
        query = query_params.get("q", [""])[0].lower()
        sku = query_params.get("sku", [""])[0].upper()
        hub = query_params.get("hub", [""])[0].lower()
        category = query_params.get("category", [""])[0].lower()

        filtered = WAREHOUSE_INVENTORY
        if sku:
            filtered = [item for item in filtered if item["sku"] == sku]
        elif query:
            filtered = [
                item for item in filtered 
                if query in item["name"].lower() or query in item["sku"].lower() or query in item["category"].lower()
            ]

        if category and category != "all":
            filtered = [item for item in filtered if item["category"].lower() == category]

        if hub:
            filtered = [
                item for item in filtered
                if any(hub in wh.lower() and count > 0 for wh, count in item.get("warehouses", {}).items())
            ]

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'public, max-age=60, s-maxage=300')
        self.end_headers()
        
        response = {
            "client": "Northstar Retail Co.",
            "service": "Mock Warehouse API",
            "poll_interval_seconds": 300,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "hubs": WAREHOUSE_HUBS,
            "count": len(filtered),
            "items": filtered
        }
        self.wfile.write(json.dumps(response).encode('utf-8'))
        return
