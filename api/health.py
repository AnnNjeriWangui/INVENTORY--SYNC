"""
Vercel Serverless Function: GET /api/health
Health check endpoint for Northstar Retail Co live inventory sync service.
"""

import json
import time

def handler(request):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps({
            "status": "healthy",
            "service": "Northstar Retail Co. Inventory Sync Service",
            "sprint": "Sprint 2",
            "retry_engine": "active",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        })
    }
