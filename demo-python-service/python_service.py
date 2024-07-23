from flask import Flask, request, jsonify
import asyncio
from py_eureka_client.eureka_client import EurekaClient

app = Flask(__name__)

async def start_eureka():
    eureka_client = EurekaClient(
        eureka_server="http://localhost:8761/eureka/",
        app_name="python-service",
        instance_port=5001,
        instance_ip="127.0.0.1",  # Use localhost
    )
    await eureka_client.start()

@app.route('/process', methods=['POST'])
def process_data():
    data = request.json
    processed_data = {'result': data['value'] * 2}  # Example processing
    return jsonify(processed_data)

if __name__ == '__main__':
    asyncio.run(start_eureka())  # Start Eureka client asynchronously
    app.run(port=5001)
