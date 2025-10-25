import json

def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }

def lambda_handler(event, context):
    path = event.get("rawPath", "/")
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()

    if method == "GET" and path == "/info":
        return _resp(200, {"app": "python-service", "status": "running"})

    if method == "POST" and path == "/process":
        try:
            payload = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            return _resp(400, {"error": "Invalid JSON"})

        value = payload.get("value")
        if not isinstance(value, (int, float)):
            return _resp(400, {"error": "Value must be a number"})
        return _resp(200, {"result": value * 2})

    return _resp(404, {"error": "Not found"})
