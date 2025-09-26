# Python Microservice

This Python-based microservice uses Flask and registers itself with a Eureka server. It provides a /process endpoint for basic computation and includes a Swagger UI for API documentation.

## Features

- Exposes a POST /process endpoint to double a numeric value.
- Registers with Eureka for service discovery.
- Provides an /info endpoint for metadata.
- Includes Swagger UI at /apidocs using flasgger.

## Requirements

* Python 3.10+
* pip
* Eureka server running at http://eureka-server:8761/eureka/

## Installation

```bash
pip install -r requirements.txt
```

## How to Run

### Option 1: Run locally with python

```bash
python app.py
```

### Option 2: Run with Docker

Build the Docker image:

```bash
docker run -p 5001:5001 --network=mynet python-service
```

Run the container (assumes Eureka is running and accessible):

```bash
docker run -p 8080:8080 --network your-docker-network-name java-service
```

## API

### POST `/process`

**Request:**

```json
{
  "value": 10
}
```

**Response:**

```json
{
  "result": 20
}
```
### GET `/info`

**Response:**

```json
{
  "app": "python-service",
  "status": "running"
}
```

## Swagger Integration

This project uses springdoc-openapi for Swagger support.

OpenAPI Spec: http://localhost:5001/apidocs


## License

This project is for demonstration and educational purposes.
