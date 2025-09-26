from flask import Flask, request, jsonify
import asyncio
from py_eureka_client.eureka_client import EurekaClient
from flasgger import Swagger

app = Flask(__name__)
swagger = Swagger(app)  # Enable Swagger UI

def start_eureka_sync():
    try:
        eureka_client = EurekaClient(
            eureka_server="http://eureka-server:8761/eureka/",
            app_name="python-service",
            instance_port=5001,
            instance_ip="python-service",
        )
        eureka_client.start()
    except Exception as e:
        print(f"Failed to register with Eureka: {e}")

@app.route('/process', methods=['POST'])
def process_data():
    """
    Process input value by doubling it
    ---
    tags:
      - Processing
    parameters:
      - in: body
        name: body
        schema:
          type: object
          required:
            - value
          properties:
            value:
              type: number
              example: 10
    responses:
      200:
        description: Returns doubled value
        schema:
          type: object
          properties:
            result:
              type: number
              example: 20
    """
    if not request.json:
        return jsonify({'error': 'Request body is required'}), 400
    
    data = request.json
    if 'value' not in data:
        return jsonify({'error': 'Value field is required'}), 400
    
    try:
        processed_data = {'result': data['value'] * 2}
        return jsonify(processed_data)
    except (TypeError, ValueError) as e:
        return jsonify({'error': 'Invalid value type'}), 400

@app.route('/info', methods=['GET'])
def info():
    """
    Service information endpoint
    ---
    tags:
      - Info
    responses:
      200:
        description: Basic service metadata
        schema:
          type: object
          properties:
            app:
              type: string
              example: python-service
            status:
              type: string
              example: running
    """
    return jsonify({"app": "python-service", "status": "running"})

if __name__ == '__main__':
    import threading
    # Start Eureka registration in background thread
    eureka_thread = threading.Thread(target=start_eureka_sync)
    eureka_thread.daemon = True
    eureka_thread.start()
    
    app.run(host='0.0.0.0', port=5001)
