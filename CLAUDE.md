# CLAUDE.md - AI Assistant Guide

> Comprehensive guide for AI assistants working with the Demo Microservices codebase.
> Last Updated: 2025-11-13

## Table of Contents

1. [Repository Overview](#repository-overview)
2. [Codebase Structure](#codebase-structure)
3. [Technology Stack](#technology-stack)
4. [Development Workflows](#development-workflows)
5. [Testing Strategy](#testing-strategy)
6. [Deployment Strategies](#deployment-strategies)
7. [Key Conventions for AI Assistants](#key-conventions-for-ai-assistants)
8. [Common Operations](#common-operations)
9. [Security Guidelines](#security-guidelines)
10. [Pattern Documentation](#pattern-documentation)
11. [Troubleshooting Guide](#troubleshooting-guide)

---

## Repository Overview

This is a **comprehensive microservices architecture demonstration** featuring:

- **Purpose**: Educational and demonstration repository showcasing production-ready microservices patterns
- **Architecture**: Polyglot microservices with service discovery, multiple deployment strategies, and cloud-native patterns
- **Scale**: 11 services (4 full-featured + 4 simplified + 3 serverless), 42+ microservices patterns
- **Languages**: Java, Node.js, Python
- **Deployment**: Docker Compose, Local Development, AWS ECS, AWS Lambda

### Core Services

| Service | Technology | Port | Purpose |
|---------|------------|------|---------|
| **demo-eureka-server** | Spring Boot 3.3.1, Java 22 | 8761 | Service discovery and registration (Netflix Eureka) |
| **demo-java-service** | Spring Boot 3.3.1, Java 22 | 8080 | Full-featured Java microservice with 30+ patterns |
| **demo-node-service** | Express 4.21.1, Node 20 | 3000 | Full-featured Node.js microservice with 38+ patterns |
| **demo-python-service** | Flask 3.0.0, Python 3.11 | 5001 | Full-featured Python microservice with 36+ patterns |
| **mysql** | MySQL 8.0 | 3306 | Persistent data storage with health checks |

### Simplified Services

- `demo-simple-eureka-server`: Basic Eureka without patterns
- `demo-simple-java-service`: Minimal Java service for comparison
- `demo-simple-node-service`: Minimal Node.js service
- `demo-simple-python-service`: Minimal Python service

### Lambda Functions

- `demo-lambda-java-service`: Spring Boot serverless (Java 21)
- `demo-lambda-node-service`: Lightweight serverless (Node 22)
- `demo-lambda-python-service`: Data processing serverless (Python 3.11)

---

## Codebase Structure

```
demo-microservices/
├── .git/                           # Git repository
├── .gitignore                      # Git ignore patterns
├── .env.security                   # Security configuration template
│
├── README.md                       # Main documentation
├── CLAUDE.md                       # This file - AI assistant guide
├── JAVA-PATTERNS.md               # Java patterns documentation (16KB)
├── NODE-PATTERNS.md               # Node.js patterns documentation (33KB)
├── PYTHON-PATTERNS.md             # Python patterns documentation (55KB)
├── SECURITY-FIXES.md              # Security improvements log
├── CRITICAL-FIXES-COMPLETE.md     # Critical fixes report
├── PATTERN-REVIEW-COMPLETE.md     # Pattern implementation review
│
├── demo-eureka-server/            # Service Discovery
│   ├── src/main/java/             # Java source code
│   ├── src/test/java/             # Test files
│   ├── Dockerfile                 # Container definition
│   └── pom.xml                    # Maven dependencies
│
├── demo-java-service/             # Full Java Microservice
│   ├── src/main/java/com/demo/patterns/
│   │   ├── resilience/            # Circuit breaker, retry, bulkhead
│   │   ├── caching/               # Cache-aside, write-through, multi-level
│   │   ├── messaging/             # Kafka, outbox, event sourcing
│   │   ├── transaction/           # 2PC, distributed locks, saga
│   │   ├── architectural/         # CQRS, hexagonal, repository
│   │   ├── integration/           # API gateway, anti-corruption layer
│   │   ├── deployment/            # Feature toggles, canary deployment
│   │   ├── performance/           # Async processing, reactive streams
│   │   ├── monitoring/            # Health checks, metrics, tracing
│   │   └── security/              # Rate limiting, JWT auth
│   ├── Dockerfile
│   └── pom.xml
│
├── demo-node-service/             # Full Node.js Microservice
│   ├── patterns/                  # Same structure as Java
│   │   ├── resilience/
│   │   ├── caching/
│   │   ├── messaging/
│   │   ├── transaction/
│   │   ├── architectural/
│   │   ├── integration/
│   │   ├── deployment/
│   │   ├── performance/
│   │   ├── monitoring/
│   │   └── security/
│   ├── app.js                     # Main application entry
│   ├── config.js                  # Configuration management
│   ├── Dockerfile
│   └── package.json               # npm dependencies
│
├── demo-python-service/           # Full Python Microservice
│   ├── patterns/                  # Same structure as Java/Node
│   ├── app.py                     # Main Flask application
│   ├── config.py                  # Configuration management
│   ├── Dockerfile
│   └── requirements.txt           # pip dependencies
│
├── demo-simple-*/                 # Simplified versions (minimal patterns)
│
├── demo-lambda-*/                 # Serverless functions
│   ├── handler.js / lambda_function.py / Handler.java
│   └── deployment configs
│
├── db/                            # Database initialization
│   └── init/                      # SQL scripts for MySQL setup
│
├── infra/                         # Infrastructure as Code (Terraform)
│   ├── modules/
│   │   ├── vpc/                   # VPC, subnets, gateways
│   │   └── instances/             # EC2, security groups
│   ├── docker/                    # ECS deployment configuration
│   │   └── ecs_stack.tf
│   ├── serverless/                # Lambda deployment
│   │   └── lambda_api.tf
│   ├── provider.tf                # AWS provider config
│   ├── vars.tf                    # Variable definitions
│   ├── rds.tf                     # RDS MySQL setup
│   ├── s3.tf                      # S3 buckets
│   └── role.tf                    # IAM roles
│
├── docker-compose.yml             # Container orchestration
├── run.sh / run.bat               # Multi-environment launcher scripts
├── create_stack.sh                # Stack creation automation
├── destroy_stack.sh               # Stack teardown automation
├── validate-security.sh           # Security validation script
└── pattern-gap-analysis.sh        # Pattern coverage analysis
```

### Pattern Organization

All full-featured services organize patterns into **10 categories**:

1. **resilience/** - Circuit breaker, retry, bulkhead, timeout, fallback
2. **caching/** - Cache-aside, write-through, write-behind, multi-level, materialized view
3. **messaging/** - Event streaming, message queue, outbox, inbox, event sourcing
4. **transaction/** - 2PC, distributed locks, idempotency, saga
5. **architectural/** - Hexagonal, CQRS, repository, specification, domain events
6. **integration/** - API gateway, anti-corruption layer, strangler fig, service registry
7. **deployment/** - Feature toggles, canary, blue-green deployments
8. **performance/** - Async processing, reactive streams, worker pools, worker threads
9. **monitoring/** - Health checks, metrics, distributed tracing
10. **security/** - Rate limiting, authentication, authorization

---

## Technology Stack

### Backend Frameworks

| Language | Framework | Version | Key Libraries |
|----------|-----------|---------|---------------|
| **Java** | Spring Boot | 3.3.1 | Spring Cloud 2023.0.2, JPA, Spring Security |
| **Node.js** | Express | 4.21.1 | Eureka JS Client, Swagger, Helmet |
| **Python** | Flask | 3.0.0 | py-eureka-client, Flasgger, SQLAlchemy |

### Runtime Versions

- **Java**: 22 (production services), 21 (lambda)
- **Node.js**: 20 (production services), 22 (lambda)
- **Python**: 3.11 (production services and lambda)

### Infrastructure & DevOps

| Category | Technology | Purpose |
|----------|------------|---------|
| **Service Discovery** | Netflix Eureka | Service registration and discovery |
| **Containerization** | Docker, Docker Compose | Local development and deployment |
| **Cloud Platform** | AWS | ECS, Lambda, RDS, S3, API Gateway |
| **Infrastructure as Code** | Terraform | Modular AWS resource management |
| **Database** | MySQL 8.0 | Persistent storage with encryption |
| **API Documentation** | Swagger/OpenAPI 3.0 | Interactive API documentation |
| **Version Management** | SDKMAN, NVM, pyenv | Runtime version management |

### Key Dependencies by Service

**Java Service (pom.xml):**
- Spring Boot Starter (Web, Data JPA, Security, Actuator)
- Spring Cloud Netflix Eureka Client
- Resilience4j (circuit breaker, retry, bulkhead, rate limiter)
- Micrometer + Prometheus
- Springdoc OpenAPI
- MySQL Connector, H2 Database
- Spring Kafka, Spring AMQP
- Bucket4j (rate limiting)

**Node Service (package.json):**
- Express 4.21.1
- eureka-js-client 4.5.0
- opossum 8.0.0 (circuit breaker)
- ioredis 5.3.2, redis 4.6.10
- kafkajs 2.2.4, amqplib 0.10.3
- prom-client 15.1.0
- express-rate-limit 7.1.5
- helmet 7.1.0, jsonwebtoken 9.0.2
- winston 3.11.0 (logging)
- bull 4.12.2 (job queue)
- rxjs 7.8.1 (reactive programming)

**Python Service (requirements.txt):**
- Flask 3.0.0
- py-eureka-client
- Flask-SQLAlchemy
- redis, kafka-python, pika (RabbitMQ)
- prometheus-client
- Flask-Limiter
- PyJWT, Flask-JWT-Extended
- structlog (structured logging)
- aiohttp (async HTTP)
- pybreaker (circuit breaker)
- tenacity (retry)

### Resilience & Reliability

- **Circuit Breaker**: Resilience4j (Java), Opossum (Node), pybreaker (Python)
- **Retry**: Spring Retry (Java), async-retry (Node), tenacity (Python)
- **Rate Limiting**: Bucket4j (Java), express-rate-limit (Node), Flask-Limiter (Python)
- **Bulkhead**: Pattern isolation across all services

### Monitoring & Observability

- **Metrics**: Prometheus (prom-client, micrometer-registry-prometheus)
- **Distributed Tracing**: OpenTelemetry, Zipkin, Brave
- **Health Checks**: Spring Boot Actuator, custom health endpoints
- **Logging**: Winston (Node), structlog (Python), SLF4J + Logback (Java)

---

## Development Workflows

### Initial Setup

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd demo-microservices
   ```

2. **Configure Environment**
   ```bash
   # Copy security template to .env
   cp .env.security .env

   # Edit .env with your values
   # IMPORTANT: Never commit .env to version control
   ```

3. **Choose Development Mode**
   - **Docker (Recommended)**: `./run.sh docker`
   - **Local Development**: `./run.sh local`
   - **AWS Cloud**: `./run.sh aws`
   - **Serverless Only**: `./run.sh lambda`

### Docker Development Workflow

**Starting Services:**
```bash
# Start all services with Docker Compose
./run.sh docker

# Or manually
docker-compose up --build
```

**Key Features:**
- Health checks ensure proper startup order: Eureka → MySQL → Application Services
- Automatic restart with `unless-stopped` policy
- Dedicated `micro_net` bridge network for inter-service communication
- Persistent MySQL data volume

**Viewing Logs:**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f java-service
docker-compose logs -f node-service
```

**Stopping Services:**
```bash
docker-compose down

# Remove volumes too
docker-compose down -v
```

### Local Development Workflow

**Setup with Version Managers:**
```bash
# Install version managers first (if not installed)
# SDKMAN for Java: curl -s https://get.sdkman.io | bash
# NVM for Node: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# pyenv for Python: curl https://pyenv.run | bash

# Run with specific versions
./run.sh local --java-version 21 --node-version 20 --python-version 3.11

# Or use defaults
./run.sh local
```

**The script automatically:**
1. Detects and configures version managers (SDKMAN, NVM, pyenv)
2. Installs required runtime versions if missing
3. Starts services in correct order (Eureka → Database → Services)
4. Sets up hot-reload for development

**Manual Service Start:**

*Java Service:*
```bash
cd demo-java-service
./mvnw spring-boot:run
```

*Node Service:*
```bash
cd demo-node-service
npm install
npm run dev  # with nodemon for hot-reload
```

*Python Service:*
```bash
cd demo-python-service
pip install -r requirements.txt
python app.py
```

### Build Process

**Java (Maven):**
```bash
cd demo-java-service

# Clean and compile
./mvnw clean compile

# Run tests
./mvnw test

# Package JAR
./mvnw clean package

# Skip tests (for faster builds)
./mvnw clean package -DskipTests
```

**Node.js (npm):**
```bash
cd demo-node-service

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in production mode
npm start

# Run tests
npm test
```

**Python (pip):**
```bash
cd demo-python-service

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run application
python app.py

# Run tests
python -m pytest
```

### Code Organization Conventions

When working with this codebase, follow these conventions:

1. **Pattern Implementations**: Always place pattern code in the appropriate category folder
   - Java: `src/main/java/com/demo/patterns/{category}/`
   - Node: `patterns/{category}/`
   - Python: `patterns/{category}/`

2. **Configuration Files**:
   - Java: `src/main/resources/application.yml`
   - Node: `config.js` (root of service)
   - Python: `config.py` (root of service)

3. **Main Entry Points**:
   - Java: `*Application.java` (e.g., `DemoJavaServiceApplication.java`)
   - Node: `app.js`
   - Python: `app.py`

4. **Test Files**:
   - Java: `src/test/java/**/*Test.java` or `*Tests.java`
   - Node: `*.test.js` or `__tests__/*.js`
   - Python: `test_*.py` or `*_test.py`

### Hot Reload / Live Development

- **Java**: Use Spring Boot DevTools (already configured)
  ```bash
  ./mvnw spring-boot:run
  ```
  Changes to Java files trigger automatic restart

- **Node**: Use nodemon (already configured)
  ```bash
  npm run dev
  ```
  Changes to JS files trigger automatic restart

- **Python**: Use Flask's debug mode (enabled in development)
  ```bash
  FLASK_ENV=development python app.py
  ```
  Changes to Python files trigger automatic reload

---

## Testing Strategy

### Test Frameworks

| Language | Framework | Test Location | Command |
|----------|-----------|---------------|---------|
| **Java** | JUnit 5, Spring Boot Test | `src/test/java/` | `./mvnw test` |
| **Node** | Jest, Supertest | `*.test.js` or `__tests__/` | `npm test` |
| **Python** | pytest, pytest-flask | `test_*.py` or `tests/` | `python -m pytest` |

### Testing Patterns

**Unit Tests:**
- Test individual pattern implementations
- Mock external dependencies (databases, message queues, Redis)
- Focus on business logic and pattern correctness

**Integration Tests:**
- Test service-to-service communication
- Verify Eureka registration
- Test database integration
- Test API endpoints end-to-end

**Example Test Commands:**

```bash
# Java - Run all tests
cd demo-java-service && ./mvnw test

# Java - Run specific test class
./mvnw test -Dtest=DemoJavaServiceApplicationTests

# Node - Run all tests
cd demo-node-service && npm test

# Node - Run with coverage
npm test -- --coverage

# Python - Run all tests
cd demo-python-service && python -m pytest

# Python - Run with verbose output
python -m pytest -v

# Python - Run specific test file
python -m pytest test_app.py
```

### Manual Testing

**Service Health Checks:**
```bash
# Eureka Server
curl http://localhost:8761/actuator/health

# Java Service
curl http://localhost:8080/actuator/health

# Node Service
curl http://localhost:3000/info

# Python Service
curl http://localhost:5001/info
```

**API Endpoints:**
```bash
# Java Service - Swagger UI
http://localhost:8080/swagger-ui.html

# Node Service - Swagger UI
http://localhost:3000/api-docs

# Python Service - Flasgger UI
http://localhost:5001/apidocs
```

**Example API Call:**
```bash
# Process endpoint (all services have similar endpoint)
curl -X POST http://localhost:8080/process \
  -H "Content-Type: application/json" \
  -d '{"value": 10}'

# Expected response: {"result": 20}
```

**Service Discovery:**
```bash
# View all registered services
curl http://localhost:8761/eureka/apps

# View specific service instances
curl http://localhost:8761/eureka/apps/JAVA-SERVICE
```

### Test Coverage

Services include tests for:
- Core application startup
- API endpoint functionality
- Pattern implementations (circuit breaker, retry, cache, etc.)
- Database integration
- Eureka registration
- Health checks
- Security (JWT, rate limiting)

---

## Deployment Strategies

### 1. Docker Compose (Local/Development)

**Use Case**: Local development, testing, demos

**Command:**
```bash
./run.sh docker
```

**What Happens:**
1. Builds Docker images for all services
2. Creates `micro_net` bridge network
3. Starts MySQL with initialization scripts
4. Starts Eureka Server with health checks
5. Starts application services (Java, Node, Python)
6. Configures environment variables from `.env` file

**Service URLs:**
- Eureka Dashboard: http://localhost:8761
- Java Service: http://localhost:8080
- Node Service: http://localhost:3000
- Python Service: http://localhost:5001
- MySQL: localhost:3306

**Features:**
- Health check dependencies ensure correct startup order
- Automatic restart on failure
- Persistent MySQL data volume
- Environment-based configuration

**Cleanup:**
```bash
docker-compose down -v  # Remove containers and volumes
```

### 2. Local Development (No Containers)

**Use Case**: Active development with hot-reload

**Command:**
```bash
./run.sh local
```

**What Happens:**
1. Checks for version managers (SDKMAN, NVM, pyenv)
2. Installs/activates correct runtime versions
3. Starts MySQL container (required dependency)
4. Starts Eureka Server
5. Starts application services with hot-reload enabled

**Benefits:**
- Faster iteration (no container rebuilds)
- Direct debugging support
- IDE integration
- Hot-reload for all services

**Requirements:**
- SDKMAN (Java management)
- NVM (Node.js management)
- pyenv (Python management)

### 3. AWS ECS Deployment (Container Orchestration)

**Use Case**: Production cloud deployment with containers

**Command:**
```bash
./run.sh aws
```

**Infrastructure Created:**
- **VPC**: Custom VPC with public/private subnets
- **ECS Cluster**: Fargate-based container orchestration
- **RDS MySQL**: Managed database with encryption
- **Load Balancer**: Application Load Balancer for traffic distribution
- **Security Groups**: Restrictive ingress/egress rules
- **IAM Roles**: Least-privilege access for services
- **CloudWatch Logs**: Centralized logging

**Terraform Workflow:**
```bash
cd infra/docker

# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Apply infrastructure
terraform apply

# Destroy infrastructure
terraform destroy
```

**Key Features:**
- Auto-scaling based on CPU/memory
- Managed container orchestration
- High availability across multiple AZs
- Encrypted RDS storage
- CloudWatch integration for monitoring

### 4. AWS Lambda Deployment (Serverless)

**Use Case**: Event-driven, sporadic workloads, cost optimization

**Command:**
```bash
./run.sh lambda
```

**Infrastructure Created:**
- **Lambda Functions**: Serverless compute for Java, Node, Python
- **API Gateway**: HTTP API endpoints
- **IAM Roles**: Function execution roles
- **CloudWatch Logs**: Function logging
- **S3 Buckets**: Deployment artifacts (if needed)

**Terraform Workflow:**
```bash
cd infra/serverless

# Initialize and deploy
terraform init
terraform apply

# Test Lambda function
aws lambda invoke \
  --function-name demo-node-lambda \
  --payload '{"value": 10}' \
  response.json

# View logs
aws logs tail /aws/lambda/demo-node-lambda --follow
```

**Lambda Characteristics:**
- **Cold Start**: First invocation may have latency
- **Timeout**: Configure appropriate timeout (default 30s)
- **Memory**: 128MB to 10GB (affects CPU allocation)
- **Pricing**: Pay per invocation and duration

### Deployment Comparison

| Aspect | Docker Compose | Local Dev | AWS ECS | AWS Lambda |
|--------|----------------|-----------|---------|------------|
| **Cost** | Free (local) | Free (local) | $$ (always running) | $ (pay per use) |
| **Startup** | 30-60 seconds | 15-30 seconds | 2-3 minutes | <1 second (warm) |
| **Scaling** | Manual | Manual | Auto-scaling | Automatic |
| **Monitoring** | Docker logs | Console logs | CloudWatch | CloudWatch |
| **Best For** | Development | Active coding | Production 24/7 | Event-driven |
| **Complexity** | Low | Low | Medium | Medium |

---

## Key Conventions for AI Assistants

### When Working with This Codebase

#### 1. Service Identification

Always identify which service(s) you're working with:
- **Full-featured services**: `demo-java-service`, `demo-node-service`, `demo-python-service`
- **Simplified services**: `demo-simple-*` (minimal patterns for comparison)
- **Lambda functions**: `demo-lambda-*` (serverless versions)
- **Infrastructure**: `infra/` (Eureka Server lives here too)

#### 2. Pattern Implementation Guidelines

When implementing or modifying patterns:

**DO:**
- Place code in the correct pattern category folder
- Follow existing pattern structure in that language
- Add comprehensive comments explaining the pattern
- Include error handling and logging
- Update the corresponding `*-PATTERNS.md` file if adding new patterns
- Maintain consistency across Java/Node/Python implementations

**DON'T:**
- Mix pattern categories (keep resilience patterns in `resilience/`)
- Hardcode configuration values (use environment variables)
- Skip error handling or validation
- Break existing service contracts (API endpoints)

**Example Pattern Locations:**
```
Circuit Breaker:
  - Java: src/main/java/com/demo/patterns/resilience/CircuitBreakerPattern.java
  - Node: patterns/resilience/circuit-breaker.js
  - Python: patterns/resilience/circuit_breaker.py
```

#### 3. Environment Variables

**CRITICAL**: Never hardcode sensitive values!

**Always use environment variables for:**
- Database credentials (`MYSQL_*`)
- JWT secrets (`JWT_SECRET`)
- Service URLs (`EUREKA_SERVER_URL`, `REDIS_URL`)
- API keys
- Rate limits and thresholds

**How to add new environment variables:**

1. Add to `.env.security` (template):
   ```bash
   NEW_CONFIG_VALUE=default-value-change-in-production
   ```

2. Add to `docker-compose.yml` for each service:
   ```yaml
   services:
     java-service:
       environment:
         - NEW_CONFIG_VALUE=${NEW_CONFIG_VALUE}
   ```

3. Reference in code:
   - Java: `@Value("${new.config.value}")` or `System.getenv("NEW_CONFIG_VALUE")`
   - Node: `process.env.NEW_CONFIG_VALUE`
   - Python: `os.environ.get('NEW_CONFIG_VALUE')`

#### 4. API Endpoint Conventions

All services follow consistent endpoint patterns:

**Standard Endpoints:**
- `GET /info` - Service metadata (name, version, uptime)
- `GET /health` - Health status (Java has `/actuator/health`)
- `GET /metrics` - Prometheus metrics (Java has `/actuator/metrics`)
- `POST /process` or `/calculate` - Main processing endpoint
- `GET /api-docs` or `/swagger-ui.html` - API documentation

**When adding new endpoints:**
- Use RESTful conventions (GET for reads, POST for creates, PUT for updates, DELETE for deletes)
- Include input validation
- Return consistent JSON structures
- Add Swagger/OpenAPI documentation
- Implement appropriate error handling
- Add rate limiting for public endpoints

#### 5. Logging Standards

**Use appropriate log levels:**
- `ERROR`: Unrecoverable errors, exceptions
- `WARN`: Recoverable issues, degraded performance
- `INFO`: Important state changes, startup/shutdown
- `DEBUG`: Detailed flow information (development only)

**Log structured data:**
- Java: Use SLF4J with structured logging
- Node: Use Winston with JSON format
- Python: Use structlog

**Example:**
```javascript
// Node.js
logger.info('Processing request', {
  requestId: req.id,
  userId: req.user.id,
  action: 'process'
});
```

#### 6. Error Handling

**Always include:**
- Try-catch blocks around external calls
- Meaningful error messages
- Proper HTTP status codes
- Error logging with context
- Graceful degradation where possible

**HTTP Status Code Conventions:**
- `200 OK` - Successful GET/PUT
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing/invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Unexpected server error
- `503 Service Unavailable` - Circuit breaker open, service degraded

#### 7. Dependency Management

**Before adding new dependencies:**
1. Check if similar functionality already exists
2. Verify the package is actively maintained
3. Check for security vulnerabilities
4. Use specific versions (not `latest` or `*`)
5. Update all three services if the pattern applies to all

**Package files:**
- Java: `pom.xml` (Maven)
- Node: `package.json` (npm)
- Python: `requirements.txt` (pip)

**Security scanning:**
```bash
# Node.js
npm audit

# Python
pip-audit  # or safety check

# Java
./mvnw dependency-check:check
```

#### 8. Database Interactions

**Always:**
- Use parameterized queries (prevent SQL injection)
- Implement connection pooling
- Handle connection failures gracefully
- Close connections properly
- Use transactions for multi-step operations

**ORM/Database Access:**
- Java: Spring Data JPA + Hibernate
- Node: mysql2 with connection pools
- Python: SQLAlchemy ORM

#### 9. Testing Requirements

**When adding new features:**
1. Write unit tests for business logic
2. Add integration tests for API endpoints
3. Mock external dependencies (databases, message queues, Redis)
4. Aim for >80% code coverage
5. Run tests before committing: `./mvnw test` / `npm test` / `pytest`

#### 10. Documentation Updates

**Update documentation when:**
- Adding new patterns (update `*-PATTERNS.md`)
- Adding new API endpoints (update Swagger annotations)
- Changing deployment process (update `README.md`)
- Adding new environment variables (update `.env.security`)
- Changing infrastructure (update `infra/README.md` if exists)

#### 11. Git Workflow

**Branch naming:**
- Feature: `feature/pattern-name` or `feature/service-improvement`
- Bug fix: `fix/issue-description`
- Documentation: `docs/update-description`

**Commit messages:**
- Use present tense: "Add circuit breaker pattern" not "Added circuit breaker pattern"
- Be descriptive: Include what and why
- Reference issues if applicable: "Add rate limiting (fixes #123)"

**Before committing:**
1. Run tests: `./mvnw test` / `npm test` / `pytest`
2. Run linters if configured
3. Check for uncommitted `.env` files (should be in `.gitignore`)
4. Verify no hardcoded credentials

#### 12. Docker Best Practices

**When modifying Dockerfiles:**
- Use specific base image versions (not `latest`)
- Leverage layer caching (install dependencies before copying code)
- Use multi-stage builds for smaller images
- Don't include secrets in images
- Add health checks
- Use non-root users when possible

**Example pattern:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["npm", "start"]
```

#### 13. Performance Considerations

**When implementing patterns:**
- Use caching strategically (cache-aside, write-through)
- Implement rate limiting to prevent abuse
- Use connection pooling for databases
- Implement circuit breakers for external calls
- Use async processing for long-running tasks
- Monitor memory usage and prevent leaks

#### 14. Security Checklist

Before deploying or committing code:

- [ ] No hardcoded credentials or API keys
- [ ] All secrets use environment variables
- [ ] Input validation on all API endpoints
- [ ] Parameterized database queries (no SQL injection)
- [ ] Rate limiting configured
- [ ] JWT secrets are strong and environment-based
- [ ] CORS properly configured
- [ ] Error messages don't leak sensitive information
- [ ] Dependencies are up-to-date (no known vulnerabilities)
- [ ] Authentication/authorization implemented where needed

#### 15. Monitoring & Observability

**Ensure services expose:**
- Health check endpoints (liveness and readiness)
- Prometheus metrics endpoint
- Structured logs (JSON format)
- Distributed tracing headers (if using Zipkin/Jaeger)
- Request/response logging (with PII redaction)

#### 16. Common Anti-Patterns to Avoid

**DON'T:**
- ❌ Hardcode configuration values
- ❌ Ignore error handling
- ❌ Skip input validation
- ❌ Use synchronous blocking calls for external services
- ❌ Create god objects or services that do everything
- ❌ Skip logging for important operations
- ❌ Commit `.env` files
- ❌ Use `console.log` in production (use proper loggers)
- ❌ Ignore rate limiting
- ❌ Skip circuit breakers on external calls

**DO:**
- ✅ Use environment variables for configuration
- ✅ Implement comprehensive error handling
- ✅ Validate all inputs
- ✅ Use async/non-blocking patterns
- ✅ Follow single responsibility principle
- ✅ Use structured logging
- ✅ Keep secrets in `.env` (gitignored)
- ✅ Use proper logging frameworks
- ✅ Implement rate limiting
- ✅ Use circuit breakers for resilience

---

## Common Operations

### Adding a New Microservices Pattern

1. **Choose the pattern category** (resilience, caching, messaging, etc.)

2. **Implement in all three languages** for consistency:

   **Java:**
   ```bash
   # Create pattern class
   touch demo-java-service/src/main/java/com/demo/patterns/{category}/{PatternName}Pattern.java

   # Create test class
   touch demo-java-service/src/test/java/com/demo/patterns/{category}/{PatternName}PatternTests.java
   ```

   **Node:**
   ```bash
   # Create pattern module
   touch demo-node-service/patterns/{category}/{pattern-name}.js

   # Create test file
   touch demo-node-service/__tests__/patterns/{category}/{pattern-name}.test.js
   ```

   **Python:**
   ```bash
   # Create pattern module
   touch demo-python-service/patterns/{category}/{pattern_name}.py

   # Create test file
   touch demo-python-service/tests/test_{pattern_name}.py
   ```

3. **Document the pattern** in the appropriate `*-PATTERNS.md` file:
   - Pattern name and purpose
   - Theory/background
   - Implementation details
   - Usage examples
   - Trade-offs and considerations

4. **Test the implementation**:
   ```bash
   ./mvnw test  # Java
   npm test     # Node
   pytest       # Python
   ```

### Adding a New API Endpoint

1. **Add endpoint to service**:

   **Java (Controller):**
   ```java
   @RestController
   public class MyController {
       @PostMapping("/my-endpoint")
       @Operation(summary = "My new endpoint")
       public ResponseEntity<MyResponse> myEndpoint(@RequestBody @Valid MyRequest request) {
           // Implementation
       }
   }
   ```

   **Node (Express):**
   ```javascript
   /**
    * @swagger
    * /my-endpoint:
    *   post:
    *     summary: My new endpoint
    */
   app.post('/my-endpoint', validate(mySchema), async (req, res) => {
       // Implementation
   });
   ```

   **Python (Flask):**
   ```python
   @app.route('/my-endpoint', methods=['POST'])
   @swag_from({
       'summary': 'My new endpoint',
       'parameters': [...]
   })
   def my_endpoint():
       # Implementation
   ```

2. **Add input validation**

3. **Add tests**

4. **Update API documentation** (Swagger will auto-update from annotations)

5. **Test manually**:
   ```bash
   curl -X POST http://localhost:8080/my-endpoint \
     -H "Content-Type: application/json" \
     -d '{"key": "value"}'
   ```

### Adding Environment Variable

1. **Add to `.env.security`** (template):
   ```bash
   MY_NEW_CONFIG=default-value
   ```

2. **Add to `docker-compose.yml`**:
   ```yaml
   services:
     java-service:
       environment:
         - MY_NEW_CONFIG=${MY_NEW_CONFIG}
   ```

3. **Reference in code**:
   ```java
   // Java
   @Value("${my.new.config}")
   private String myConfig;
   ```

   ```javascript
   // Node
   const myConfig = process.env.MY_NEW_CONFIG;
   ```

   ```python
   # Python
   my_config = os.environ.get('MY_NEW_CONFIG')
   ```

4. **Update `infra/vars.tf`** if deploying to AWS

### Debugging Services

**View Logs:**
```bash
# Docker
docker-compose logs -f java-service

# Local (check console output where service was started)

# AWS ECS
aws logs tail /ecs/java-service --follow

# AWS Lambda
aws logs tail /aws/lambda/demo-java-lambda --follow
```

**Check Service Health:**
```bash
# Health endpoints
curl http://localhost:8080/actuator/health  # Java
curl http://localhost:3000/health           # Node
curl http://localhost:5001/health           # Python

# Eureka registration
curl http://localhost:8761/eureka/apps
```

**Database Connection:**
```bash
# Connect to MySQL container
docker exec -it mysql mysql -uappuser -p
# Password from .env file

# Check connections
SHOW PROCESSLIST;
```

**Redis Cache:**
```bash
# Connect to Redis (if running)
docker exec -it redis redis-cli

# Check keys
KEYS *

# Get value
GET my-key
```

### Updating Dependencies

**Java:**
```bash
cd demo-java-service

# Update Spring Boot version in pom.xml
# Then rebuild
./mvnw clean package

# Check for updates
./mvnw versions:display-dependency-updates
```

**Node:**
```bash
cd demo-node-service

# Check for updates
npm outdated

# Update package
npm install package-name@latest

# Update all (careful!)
npm update

# Audit security
npm audit
npm audit fix
```

**Python:**
```bash
cd demo-python-service

# Update package
pip install --upgrade package-name

# Update requirements.txt
pip freeze > requirements.txt

# Security check
pip-audit
```

### Scaling Services

**Docker Compose:**
```bash
# Scale node service to 3 instances
docker-compose up --scale node-service=3

# Note: You'll need to configure load balancer
```

**AWS ECS:**
```bash
# Update desired count in Terraform
# infra/docker/ecs_stack.tf
desired_count = 3

# Apply changes
cd infra/docker && terraform apply
```

**AWS Lambda:**
```bash
# Lambda auto-scales automatically
# Configure concurrency limits if needed
aws lambda put-function-concurrency \
  --function-name demo-node-lambda \
  --reserved-concurrent-executions 100
```

---

## Security Guidelines

### Environment-Based Configuration

**CRITICAL RULE**: All sensitive data MUST use environment variables, never hardcoded values.

**Sensitive Data Includes:**
- Database credentials
- JWT secrets
- API keys
- OAuth client secrets
- Encryption keys
- Service URLs with embedded credentials

### Implemented Security Measures

This repository follows security best practices:

1. **No Hardcoded Credentials**: All secrets use environment variables
2. **JWT Security**: Configurable JWT secrets with production warnings
3. **Input Validation**: Request validation on all endpoints
4. **Rate Limiting**: Multiple strategies (token bucket, sliding window, adaptive)
5. **SQL Injection Prevention**: Parameterized queries only
6. **Environment Configuration**: Secure defaults with `.env.security` template
7. **Docker Security**: Non-root users, minimal base images
8. **Database Encryption**: RDS encryption at rest
9. **HTTPS/TLS**: Recommended for production (configure in load balancer)

### Security Checklist for AI Assistants

When writing or modifying code:

**Input Validation:**
- [ ] All user inputs are validated
- [ ] Request size limits are configured
- [ ] Content-Type headers are checked
- [ ] Malformed JSON is rejected gracefully

**Authentication & Authorization:**
- [ ] JWT secrets use environment variables
- [ ] Tokens are validated on protected endpoints
- [ ] Expired tokens are rejected
- [ ] Role-based access control is implemented where needed

**Database Security:**
- [ ] Use parameterized queries (NEVER string concatenation)
- [ ] Connection strings use environment variables
- [ ] Database users have minimal required permissions
- [ ] Sensitive data is encrypted at rest

**API Security:**
- [ ] Rate limiting is configured
- [ ] CORS is properly configured (not `*` in production)
- [ ] Error messages don't leak sensitive information
- [ ] Helmet.js (Node) or equivalent security headers are enabled

**Dependency Security:**
- [ ] Run security audits: `npm audit` / `pip-audit` / Maven dependency check
- [ ] Update vulnerable dependencies
- [ ] Use specific versions (not wildcards)

**Logging Security:**
- [ ] Don't log sensitive data (passwords, tokens, credit cards)
- [ ] Redact PII in logs
- [ ] Use appropriate log levels

**Production Recommendations:**

Beyond the implemented measures, production deployments should include:

- ✅ Enable HTTPS/TLS with valid SSL certificates
- ✅ Implement API authentication (JWT/OAuth2)
- ✅ Use AWS Secrets Manager for credential rotation
- ✅ Enable AWS CloudTrail for audit logging
- ✅ Implement DDoS protection (AWS Shield)
- ✅ Add Web Application Firewall (WAF)
- ✅ Enable VPC Flow Logs for network monitoring
- ✅ Use AWS GuardDuty for threat detection
- ✅ Implement security groups with least privilege
- ✅ Enable MFA for AWS console access

### Common Security Vulnerabilities to Avoid

**SQL Injection:**
```javascript
// ❌ NEVER DO THIS
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ ALWAYS DO THIS
const query = 'SELECT * FROM users WHERE id = ?';
db.execute(query, [userId]);
```

**XSS (Cross-Site Scripting):**
```javascript
// ❌ NEVER DO THIS
res.send(`<h1>Welcome ${req.query.name}</h1>`);

// ✅ ALWAYS DO THIS
res.json({ message: `Welcome ${validator.escape(req.query.name)}` });
```

**Hardcoded Secrets:**
```javascript
// ❌ NEVER DO THIS
const jwtSecret = 'my-secret-key';

// ✅ ALWAYS DO THIS
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}
```

**Command Injection:**
```javascript
// ❌ NEVER DO THIS
exec(`ping ${req.body.host}`);

// ✅ ALWAYS DO THIS
// Validate and sanitize, or better yet, don't execute shell commands from user input
```

### Security Testing

**Validate security configuration:**
```bash
# Run security validation script
./validate-security.sh

# Check for hardcoded secrets
grep -r "password\s*=\s*['\"]" --include="*.java" --include="*.js" --include="*.py" .

# Scan for common vulnerabilities
npm audit          # Node.js
pip-audit          # Python
./mvnw dependency-check:check  # Java
```

---

## Pattern Documentation

This repository implements **42+ microservices patterns** across Java, Node.js, and Python.

### Pattern Categories

1. **Resilience Patterns** (5 patterns)
   - Circuit Breaker
   - Retry with Exponential Backoff
   - Bulkhead
   - Timeout
   - Fallback

2. **Caching Patterns** (7 patterns)
   - Cache-Aside (Lazy Loading)
   - Write-Through
   - Write-Behind
   - Multi-Level Cache (L1 + L2)
   - Cache Warming
   - Cache Invalidation
   - Materialized View

3. **Messaging Patterns** (6 patterns)
   - Event Streaming (Kafka)
   - Message Queue (RabbitMQ)
   - Outbox Pattern
   - Inbox Pattern
   - Event Sourcing
   - Saga Pattern

4. **Transaction Patterns** (4 patterns)
   - Two-Phase Commit (2PC)
   - Distributed Lock
   - Idempotency
   - Transaction Manager

5. **Architectural Patterns** (5 patterns)
   - Hexagonal Architecture
   - CQRS (Command Query Responsibility Segregation)
   - Repository Pattern
   - Specification Pattern
   - Domain Events

6. **Integration Patterns** (4 patterns)
   - API Gateway
   - Anti-Corruption Layer
   - Strangler Fig
   - Service Registry (Eureka)

7. **Deployment Patterns** (3 patterns)
   - Feature Toggles
   - Canary Deployment
   - Blue-Green Deployment

8. **Performance Patterns** (4 patterns)
   - Async Processing
   - Reactive Streams
   - Worker Pool
   - Worker Threads

9. **Monitoring Patterns** (3 patterns)
   - Health Check (Liveness/Readiness)
   - Metrics Collection (Prometheus)
   - Distributed Tracing

10. **Security Patterns** (3 patterns)
    - Rate Limiting (Token Bucket, Sliding Window, Adaptive)
    - Authentication (JWT)
    - Authorization (RBAC)

### Pattern Documentation Files

Detailed pattern documentation is available in:

- **`JAVA-PATTERNS.md`** - Java implementations with Spring Boot (16KB, 32 patterns)
- **`NODE-PATTERNS.md`** - Node.js implementations with Express (33KB, 38 patterns)
- **`PYTHON-PATTERNS.md`** - Python implementations with Flask (55KB, 36 patterns)

Each file includes:
- Pattern theory and use cases
- Implementation details
- Code examples
- Trade-offs and considerations
- When to use / when not to use

### Pattern Implementation Locations

**Java (`demo-java-service/`):**
```
src/main/java/com/demo/patterns/
├── resilience/
│   ├── CircuitBreakerPattern.java
│   ├── RetryPattern.java
│   └── ...
├── caching/
│   ├── CacheAsidePattern.java
│   └── ...
└── [other categories]/
```

**Node (`demo-node-service/`):**
```
patterns/
├── resilience/
│   ├── circuit-breaker.js
│   ├── retry.js
│   └── ...
├── caching/
│   ├── cache-aside.js
│   └── ...
└── [other categories]/
```

**Python (`demo-python-service/`):**
```
patterns/
├── resilience/
│   ├── circuit_breaker.py
│   ├── retry.py
│   └── ...
├── caching/
│   ├── cache_aside.py
│   └── ...
└── [other categories]/
```

### Using Patterns in Your Code

**Example: Circuit Breaker Pattern**

```java
// Java
@Autowired
private CircuitBreakerPattern circuitBreakerPattern;

public String callExternalService() {
    return circuitBreakerPattern.executeWithCircuitBreaker(
        () -> externalServiceClient.getData(),
        "external-service"
    );
}
```

```javascript
// Node
const CircuitBreaker = require('./patterns/resilience/circuit-breaker');
const breaker = new CircuitBreaker(externalServiceCall, {
    threshold: 5,
    timeout: 3000
});

const result = await breaker.execute(params);
```

```python
# Python
from patterns.resilience.circuit_breaker import CircuitBreakerPattern

breaker = CircuitBreakerPattern(threshold=5, timeout=3)
result = breaker.execute(external_service_call, *args)
```

---

## Troubleshooting Guide

### Common Issues

#### 1. Services Not Registering with Eureka

**Symptoms:**
- Services start but don't appear in Eureka dashboard
- `503 Service Unavailable` when calling services

**Solutions:**
```bash
# Check Eureka is healthy
curl http://localhost:8761/actuator/health

# Check service logs for registration errors
docker-compose logs java-service | grep -i eureka

# Verify Eureka URL in environment
echo $EUREKA_SERVER_URL

# Ensure services start AFTER Eureka
# (docker-compose.yml already has depends_on with health checks)

# Check network connectivity
docker exec java-service ping eureka-server
```

**Root Causes:**
- Eureka Server not fully started before services
- Incorrect `EUREKA_SERVER_URL` environment variable
- Network issues between containers
- Firewall blocking port 8761

#### 2. Database Connection Failures

**Symptoms:**
- `Unable to connect to MySQL`
- `Access denied for user`
- Services crash on startup

**Solutions:**
```bash
# Check MySQL is running and healthy
docker-compose ps mysql
docker-compose logs mysql

# Verify credentials in .env file
cat .env | grep MYSQL

# Test connection manually
docker exec -it mysql mysql -uappuser -p${MYSQL_PASSWORD} -e "SHOW DATABASES;"

# Check if init scripts ran
docker exec mysql ls /docker-entrypoint-initdb.d/

# Restart MySQL if needed
docker-compose restart mysql

# Check connection from service
docker exec java-service nc -zv mysql 3306
```

**Root Causes:**
- `.env` file missing or incorrect credentials
- MySQL container not fully initialized
- Database doesn't exist (init scripts didn't run)
- Network connectivity issues
- Port 3306 already in use

#### 3. Port Conflicts

**Symptoms:**
- `Port already in use`
- Services fail to start
- `bind: address already in use`

**Solutions:**
```bash
# Find what's using the port (example: 8080)
lsof -i :8080       # macOS/Linux
netstat -ano | findstr :8080  # Windows

# Kill the process using the port
kill -9 <PID>

# Or change ports in docker-compose.yml
ports:
  - "8081:8080"  # Map host 8081 to container 8080

# Check all ports in use
docker-compose ps
```

**Common Port Conflicts:**
- 8080 (Java service) - often used by other apps
- 3000 (Node service) - common development port
- 3306 (MySQL) - local MySQL installation
- 8761 (Eureka) - less common

#### 4. Docker Build Failures

**Symptoms:**
- `ERROR [build] failed to solve`
- Dependency download failures
- Out of disk space

**Solutions:**
```bash
# Clean Docker cache
docker system prune -a

# Remove old images
docker image prune -a

# Build with no cache
docker-compose build --no-cache

# Check disk space
df -h
docker system df

# Pull base images manually first
docker pull openjdk:22
docker pull node:20
docker pull python:3.11
```

#### 5. Version Manager Issues (Local Development)

**SDKMAN (Java):**
```bash
# Reinstall SDKMAN
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

# Install Java version
sdk install java 21-zulu
sdk use java 21-zulu

# Verify
java -version
```

**NVM (Node):**
```bash
# Reinstall NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.nvm/nvm.sh

# Install Node version
nvm install 20
nvm use 20

# Verify
node -v
```

**pyenv (Python):**
```bash
# Reinstall pyenv
curl https://pyenv.run | bash

# Add to shell profile
export PATH="$HOME/.pyenv/bin:$PATH"
eval "$(pyenv init --path)"
eval "$(pyenv init -)"

# Install Python version
pyenv install 3.11
pyenv global 3.11

# Verify
python --version
```

#### 6. AWS Deployment Issues

**Terraform Errors:**
```bash
# Re-initialize Terraform
cd infra/docker  # or infra/serverless
rm -rf .terraform terraform.tfstate*
terraform init

# Check AWS credentials
aws configure list
aws sts get-caller-identity

# Validate Terraform configuration
terraform validate

# Plan before applying
terraform plan

# Check for resource limits
# (e.g., VPC limit, ECS service limit)
```

**ECS Task Failures:**
```bash
# Check CloudWatch logs
aws logs tail /ecs/java-service --follow

# Describe service status
aws ecs describe-services \
  --cluster demo-cluster \
  --services java-service

# Check task definition
aws ecs describe-task-definition \
  --task-definition java-service:latest
```

**Lambda Invocation Errors:**
```bash
# Test function locally
sam local invoke DemoNodeFunction

# Check function logs
aws logs tail /aws/lambda/demo-node-lambda --follow

# Test invocation
aws lambda invoke \
  --function-name demo-node-lambda \
  --payload '{"value": 10}' \
  response.json

# Check function configuration
aws lambda get-function --function-name demo-node-lambda
```

#### 7. Missing Dependencies

**Java:**
```bash
# Clear Maven cache
rm -rf ~/.m2/repository

# Force update
./mvnw clean install -U

# Skip tests if needed
./mvnw clean install -DskipTests
```

**Node:**
```bash
# Remove node_modules and package-lock
rm -rf node_modules package-lock.json

# Clean install
npm ci

# Or fresh install
npm install
```

**Python:**
```bash
# Use virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Upgrade pip first if issues
pip install --upgrade pip
```

#### 8. Health Check Failures

**Docker Compose Services Not Starting:**
```bash
# Check health check configuration
docker-compose ps

# View health check logs
docker inspect mysql | grep -A 20 Health

# Increase retry count or interval in docker-compose.yml
healthcheck:
  retries: 20  # Increase from 12
  interval: 15s  # Increase from 10s
```

#### 9. Memory/Performance Issues

**Out of Memory:**
```bash
# Check container memory usage
docker stats

# Increase memory limits in docker-compose.yml
services:
  java-service:
    mem_limit: 1g
    mem_reservation: 512m

# Or for Java specifically, set heap size
environment:
  - JAVA_OPTS=-Xmx512m -Xms256m
```

**Slow Performance:**
```bash
# Check CPU usage
docker stats

# Profile Java application
./mvnw spring-boot:run -Dspring-boot.run.jvmArguments="-Xmx512m"

# Enable debug logging temporarily
# (Set LOG_LEVEL=debug in .env)
```

#### 10. JWT/Authentication Issues

**Invalid Token Errors:**
```bash
# Verify JWT_SECRET is set and consistent
echo $JWT_SECRET

# Ensure all services use same secret
grep JWT_SECRET docker-compose.yml

# Check token expiration settings
# Default is typically 1 hour

# Test token generation
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}'
```

### Debug Mode

Enable verbose logging for troubleshooting:

**Environment Variables:**
```bash
# .env file
LOG_LEVEL=debug
SPRING_LOGGING_LEVEL_ROOT=DEBUG  # Java
NODE_ENV=development  # Node
FLASK_ENV=development  # Python
```

**Docker Compose:**
```yaml
services:
  java-service:
    environment:
      - LOGGING_LEVEL_COM_DEMO=DEBUG
      - SPRING_JPA_SHOW_SQL=true
```

### Getting Help

If you encounter issues not covered here:

1. **Check logs**: Start with service logs (`docker-compose logs -f [service]`)
2. **Review pattern documentation**: Check `*-PATTERNS.md` files
3. **Verify environment**: Ensure `.env` file is correctly configured
4. **Test connectivity**: Use `curl` to test endpoints directly
5. **Check dependencies**: Run security audits and update vulnerable packages
6. **Consult README**: Main `README.md` has additional troubleshooting
7. **GitHub Issues**: Search existing issues or create a new one

---

## Additional Resources

### Documentation Files

- **README.md** - Main repository documentation (377 lines)
- **JAVA-PATTERNS.md** - Java pattern implementations (16KB)
- **NODE-PATTERNS.md** - Node.js pattern implementations (33KB)
- **PYTHON-PATTERNS.md** - Python pattern implementations (55KB)
- **SECURITY-FIXES.md** - Security improvements log
- **CRITICAL-FIXES-COMPLETE.md** - Critical fixes completion report
- **PATTERN-REVIEW-COMPLETE.md** - Pattern implementation review

### Scripts

- **run.sh / run.bat** - Multi-environment launcher (Docker, local, AWS, Lambda)
- **create_stack.sh** - Automated stack creation
- **destroy_stack.sh** - Automated stack teardown
- **validate-security.sh** - Security validation script
- **pattern-gap-analysis.sh** - Pattern coverage analysis

### External References

- [Spring Boot Documentation](https://spring.io/projects/spring-boot)
- [Express.js Guide](https://expressjs.com/)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [Netflix Eureka](https://github.com/Netflix/eureka)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Microservices Patterns](https://microservices.io/patterns/index.html)

---

## Summary for AI Assistants

### Key Takeaways

1. **Polyglot Architecture**: Work with Java, Node.js, and Python services that implement the same patterns
2. **Pattern-Driven**: 42+ microservices patterns organized in 10 categories
3. **Environment-Based Config**: ALWAYS use environment variables, never hardcode
4. **Comprehensive Documentation**: Reference `*-PATTERNS.md` files for detailed pattern information
5. **Multiple Deployment Options**: Docker Compose, local dev, AWS ECS, AWS Lambda
6. **Security First**: Input validation, parameterized queries, rate limiting, JWT
7. **Consistent Structure**: Similar API endpoints, pattern organization across all services
8. **Test Coverage**: Unit and integration tests for all major functionality
9. **Service Discovery**: Eureka-based registration and discovery
10. **Production-Ready**: Health checks, metrics, distributed tracing, structured logging

### Before Making Changes

1. ✅ Understand which service(s) you're modifying
2. ✅ Check existing patterns and conventions
3. ✅ Review relevant `*-PATTERNS.md` documentation
4. ✅ Ensure proper error handling and logging
5. ✅ Use environment variables for configuration
6. ✅ Add appropriate tests
7. ✅ Update documentation if needed
8. ✅ Run tests before committing
9. ✅ Validate security implications
10. ✅ Follow the language-specific conventions

### Quick Reference Commands

```bash
# Start all services (Docker)
./run.sh docker

# Start for local development
./run.sh local

# Deploy to AWS
./run.sh aws

# Run tests
./mvnw test              # Java
npm test                 # Node
python -m pytest         # Python

# View logs
docker-compose logs -f [service-name]

# Check service health
curl http://localhost:8761  # Eureka dashboard
curl http://localhost:8080/actuator/health  # Java
curl http://localhost:3000/health           # Node
curl http://localhost:5001/health           # Python

# Security validation
./validate-security.sh
```

---

**This guide is maintained to help AI assistants work effectively with this codebase. Always refer to this document when working on the demo-microservices repository.**

*Last updated: 2025-11-13*
