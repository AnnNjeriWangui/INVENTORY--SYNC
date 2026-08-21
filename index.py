"""
Northstar Retail Co. - Flask API Entrypoint for Vercel
Sprint 2: Live Inventory Sync Service
"""

from flask import Flask, jsonify, request, send_from_directory
import os
import time
import random

app = Flask(__name__, static_folder='.', static_url_path='')

INVENTORY_DATA = [
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
        "last_sync": "2026-08-20T08:00:00Z"
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
        "last_sync": "2026-08-20T08:05:00Z"
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
        "last_sync": "2026-08-20T08:10:00Z"
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
        "last_sync": "2026-08-20T08:12:00Z"
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
        "last_sync": "2026-08-20T08:14:00Z"
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
        "last_sync": "2026-08-20T08:14:15Z"
    }
]

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

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

@app.route('/api/warehouse', methods=['GET'])
def warehouse():
    query = request.args.get('q', '').lower()
    sku = request.args.get('sku', '').upper()
    category = request.args.get('category', '').lower()
    hub = request.args.get('hub', '').lower()

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

    if hub:
        filtered = [
            item for item in filtered
            if any(hub in wh.lower() and count > 0 for wh, count in item.get("warehouses", {}).items())
        ]

    hubs = [
        {"id": "WH-NBO", "name": "Nairobi Central Hub", "location": "Nairobi, Kenya", "status": "OPERATIONAL", "latency_ms": 18},
        {"id": "WH-MBA", "name": "Mombasa Port Hub", "location": "Mombasa, Kenya", "status": "OPERATIONAL", "latency_ms": 24},
        {"id": "WH-KSM", "name": "Kisumu Lake Hub", "location": "Kisumu, Kenya", "status": "OPERATIONAL", "latency_ms": 32},
        {"id": "WH-NKR", "name": "Nakuru Express", "location": "Nakuru, Kenya", "status": "OPERATIONAL", "latency_ms": 28},
        {"id": "WH-ELD", "name": "Eldoret Depot", "location": "Eldoret, Kenya", "status": "OPERATIONAL", "latency_ms": 35}
    ]

    return jsonify({
        "client": "Northstar Retail Co.",
        "service": "Mock Warehouse API",
        "poll_interval_seconds": 300,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "hubs": hubs,
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

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(path):
        return send_from_directory('.', path)
    return send_from_directory('.', 'index.html')

application = app

if __name__ == '__main__':
    app.run(port=3000)
