# Java Microservice

This is a simple Java-based microservice using Spring Boot and Eureka for service discovery.

## Features

- REST API for basic calculation (`/calculate`)
- `/info` endpoint for metadata
- Registered as a Eureka client
- Spring Boot Actuator for monitoring
- Swagger/OpenAPI UI for API docs at `/swagger-ui.html`
- Dockerized for deployment

## Requirements

* Java 22
* Maven
* Docker (for containerized usage)
* Eureka Server (running on `http://eureka-server:8761/eureka/`)

## How to Run

### Option 1: Run locally with Maven

```bash
./mvnw spring-boot:run
```

Then, you can test the service using:

```bash
curl -X POST http://localhost:8080/calculate \
     -H "Content-Type: application/json" \
     -d '{"value": 10}'
```
Access API docs:

```bash
http://localhost:8080/swagger-ui.html
```

### Option 2: Run with Docker

Build the Docker image:

```bash
docker build -t java-service .
```

Run the container (assumes Eureka is running and accessible):

```bash
docker run -p 8080:8080 --network your-docker-network-name java-service
```

### Environment Config (application.yml)

```yaml
server:
  port: 8080

eureka:
  client:
    service-url:
      defaultZone: http://eureka-server:8761/eureka/

management:
  endpoints:
    web:
      exposure:
        include: "*"
```

## API

### POST `/calculate`

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
  "app": "java-service",
  "status": "running"
}
```

## Swagger Integration

This project uses springdoc-openapi for Swagger support.

Swagger UI: http://localhost:8080/swagger-ui.html

OpenAPI Spec: http://localhost:8080/v3/api-docs


## Development

You can use Spring DevTools for hot reload. Eureka will auto-register this service on startup if configured properly.

## License

This project is for demonstration and educational purposes.
