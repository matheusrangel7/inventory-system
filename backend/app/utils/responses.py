from flask import jsonify

def success(data=None, message=None, status=200):
    
    body = {"success": True}

    if message is not None:
        body["message"] = message

    if data is not None:
        body["data"] = data

    return jsonify(body), status

def error(message, status=400, details=None):
    
    body = {"success": False, "error": message}

    if details is not None:
        body["details"] = details

    return jsonify(body), status