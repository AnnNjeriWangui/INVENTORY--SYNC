"""
Northstar Retail Co. - Flask API Entrypoint for Vercel
Sprint 2: Live Inventory Sync Service
"""

from flask import Flask, jsonify, request
import time
import random

app = Flask(__name__)

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

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "service": "Northstar Retail Co. Inventory Sync Service",
        "sprint": "Sprint 2",
        "retry_engine": "active",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    })

@app.route('/api/inventory', methods=['GET'])
def inventory():
    query = request.args.get('q', '').lower()
    sku = request.args.get('sku', '').upper()
    category = request.args.get('category', '').lower()

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

    return jsonify({
        "client": "Northstar Retail Co.",
        "sprint": "Sprint 2",
        "count": len(filtered),
        "items": filtered
    })

@app.route('/api/sync', methods=['POST', 'GET'])
def sync():
    body = request.get_json(silent=True) or {}
    failure_rate = float(body.get("simulate_failure_rate", 0.0))
    force_status = int(body.get("force_status", 200))

    if force_status != 200 and force_status != 0:
        return jsonify({"error": f"Simulated Supplier HTTP {force_status}"}), force_status

    if failure_rate > 0 and random.random() < failure_rate:
        error_code = random.choice([503, 429, 500, 502])
        return jsonify({"error": f"Supplier API Transient Failure ({error_code})"}), error_code

    return jsonify({
        "client": "Northstar Retail Co.",
        "sprint": "Sprint 2",
        "status": "SUCCESS",
        "supplier_response": {
            "sync_id": f"sync_{int(time.time()*1000)}",
            "synced_items": 6,
            "status": "SUCCESS",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
    })

application = app

if __name__ == '__main__':
    app.run(port=3000)
