# Eureka Server

This project is a standalone Eureka Server used for service discovery in a microservices architecture. All registered microservices (Java, Node, Python) will appear on its dashboard.

## Features

- Service Discovery via Spring Cloud Netflix Eureka
- Dashboard available at `http://localhost:8761/`
- Dockerized and ready for container deployment

## Requirements

- Java 22
- Maven
- Docker (optional, for container deployment)

## How to Run

### Option 1: Locally with Maven

```bash
./mvnw spring-boot:run
```

Access the Eureka dashboard at:

http://localhost:8761/

### Option 2: Run with Docker

Build and run the Docker image:

```bash
docker build -t eureka-server .
docker run -p 8761:8761 --network=mynet eureka-server
```

### Environment Config (application.yml)

```yaml
server:
  port: 8761

eureka:
  client:
    register-with-eureka: false
    fetch-registry: false
```

## Dependencies

See pom.xml for full dependency list. Key dependency:

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-server</artifactId>
</dependency>
```
## Eureka Dashboard
The dashboard is available at:

http://localhost:8761/

## License

This project is for demonstration and educational purposes.
