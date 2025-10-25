# Node Microservice

This Node.js microservice uses Express.js and registers itself with a Eureka service registry for service discovery. It also exposes an `/info` endpoint and integrates with Swagger UI for service metadata documentation.

## Features

* Exposes a `/process` endpoint that doubles the numeric input.
* Registers with Eureka using `eureka-js-client`.
* Dockerized for easy deployment.
* Includes `/info` endpoint for basic metadata.
* Swagger UI available at `/api-docs` for API documentation.

## Prerequisites

* Node.js 22.x
* Eureka server running at `http://eureka-server:8761/eureka/`

## Project Structure

```
.
├── app.js               # Main application logic
├── Dockerfile           # Docker container setup
├── package.json         # Project metadata and dependencies
```

## package.json

```json
{
  "name": "demo-node-service",
  "version": "1.0.0",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "axios": "^1.7.2",
    "eureka-js-client": "^4.5.0",
    "express": "^4.19.2",
    "body-parser": "^1.19.0",
    "swagger-ui-express": "^4.6.3",
    "swagger-jsdoc": "^6.2.8"
  }
}
```

## Endpoints

### POST `/process`

Accepts a JSON payload with a numeric `value` and returns its double.

Example:

```
curl -X POST http://localhost:3000/process \
  -H "Content-Type: application/json" \
  -d '{"value": 10}'
```

Response:

```
{
  "result": 20
}
```

### GET `/info`

Returns basic service information.

Example:

```
curl http://localhost:3000/info
```

Response:

```
{
  "app": "node-service",
  "status": "running"
}
```

### GET `/api-docs`

Serves Swagger UI for exploring available API endpoints.

Visit in browser:

```
http://localhost:3000/api-docs
```

## Running the Service

### Locally

```
npm install
npm start
```

### With Docker

Build the image:

```
docker build -t node-service .
```

Run the container:

```
docker run -p 3000:3000 --network=mynet node-service
```

## Eureka Registration

Ensure your Eureka server is running and accessible at `http://eureka-server:8761/eureka/`.

The service will appear as `NODE-SERVICE` in the Eureka dashboard upon successful registration.

## Swagger Setup

To enable Swagger documentation:

1. Install Swagger dependencies:

```bash
npm install swagger-ui-express swagger-jsdoc
```

2. Add the following to `app.js`:

```javascript
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Node Service API',
      version: '1.0.0',
      description: 'API documentation for the Node microservice'
    }
  },
  apis: ['./app.js']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
```

3. Annotate your endpoints in `app.js` using Swagger comments.
