from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse

INVENTORY_DATA = [
    {
        "sku": "NSR-1001",
        "name": "Northstar Summit Waterproof Parka",
        "category": "Outerwear",
        "price": 189.99,
        "total_stock": 42,
        "reserved": 5,
        "available": 37,
        "status": "In Stock",
        "warehouses": {
            "Seattle Hub": 18,
            "Chicago Hub": 12,
            "Dallas Hub": 7,
            "NYC Express": 5
        },
        "last_sync": "2026-08-20T08:00:00Z"
    },
    {
        "sku": "NSR-1002",
        "name": "Cascade Ergonomic Support Backpack 30L",
        "category": "Accessories",
        "price": 129.50,
        "total_stock": 6,
        "reserved": 4,
        "available": 2,
        "status": "Low Stock",
        "warehouses": {
            "Seattle Hub": 2,
            "Chicago Hub": 0,
            "Dallas Hub": 0,
            "NYC Express": 4
        },
        "last_sync": "2026-08-20T08:05:00Z"
    },
    {
        "sku": "NSR-1003",
        "name": "Glacier Thermal Base Layer (Merino Wool)",
        "category": "Apparel",
        "price": 79.99,
        "total_stock": 115,
        "reserved": 10,
        "available": 105,
        "status": "In Stock",
        "warehouses": {
            "Seattle Hub": 50,
            "Chicago Hub": 35,
            "Dallas Hub": 20,
            "NYC Express": 10
        },
        "last_sync": "2026-08-20T08:10:00Z"
    },
    {
        "sku": "NSR-1004",
        "name": "Apex Trail Running Shoes (Size 10.5)",
        "category": "Footwear",
        "price": 154.00,
        "total_stock": 0,
        "reserved": 0,
        "available": 0,
        "status": "Out of Stock",
        "warehouses": {
            "Seattle Hub": 0,
            "Chicago Hub": 0,
            "Dallas Hub": 0,
            "NYC Express": 0
        },
        "last_sync": "2026-08-20T08:12:00Z"
    },
    {
        "sku": "NSR-1005",
        "name": "Vanguard All-Terrain Hydration Vest",
        "category": "Accessories",
        "price": 89.00,
        "total_stock": 24,
        "reserved": 3,
        "available": 21,
        "status": "In Stock",
        "warehouses": {
            "Seattle Hub": 10,
            "Chicago Hub": 8,
            "Dallas Hub": 4,
            "NYC Express": 2
        },
        "last_sync": "2026-08-20T08:14:00Z"
    },
    {
        "sku": "NSR-1006",
        "name": "Polaris Insulated Stainless Tumbler 32oz",
        "category": "Gear",
        "price": 34.99,
        "total_stock": 3,
        "reserved": 1,
        "available": 2,
        "status": "Low Stock",
        "warehouses": {
            "Seattle Hub": 1,
            "Chicago Hub": 1,
            "Dallas Hub": 1,
            "NYC Express": 0
        },
        "last_sync": "2026-08-20T08:14:15Z"
    }
]

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url_parts = urlparse(self.path)
        query_params = parse_qs(url_parts.query)
        
        query = query_params.get("q", [""])[0].lower()
        sku = query_params.get("sku", [""])[0].upper()
        category = query_params.get("category", [""])[0].lower()

        filtered = INVENTORY_DATA
        if sku:
            filtered = [item for item in filtered if item["sku"] == sku]
        elif query:
            filtered = [
                item for item in filtered 
                if query in item["name"].lower() or query in item["sku"].lower() or query in item["category"].lower()
            ]

        if category and category != "all":
            filtered = [item for item in filtered if item["category"].lower() == category]

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "client": "Northstar Retail Co.",
            "sprint": "Sprint 2",
            "count": len(filtered),
            "items": filtered
        }
        self.wfile.write(json.dumps(response).encode('utf-8'))
        return
