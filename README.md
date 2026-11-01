# Demo Microservices

A comprehensive microservices architecture demonstration featuring multiple deployment strategies, service discovery, and cloud-native patterns.

## 🏗️ Architecture Overview

This project demonstrates a complete microservices ecosystem with:

- **Service Discovery**: Netflix Eureka Server
- **API Gateway**: Spring Cloud Gateway — single entry point routing to every service via Eureka (`lb://`)
- **Multiple Technology Stacks**: Java (Spring Boot), Node.js (Express), Python (Flask), Go (chi), C# (ASP.NET Core)
- **Pattern Catalog**: 32 canonical microservices patterns implemented per language (`JAVA-PATTERNS.md`, `NODE-PATTERNS.md`, `PYTHON-PATTERNS.md`, `GO-PATTERNS.md`)
- **Database**: MySQL with connection pooling; Redis for the caching patterns
- **API Documentation**: Swagger/OpenAPI integration
- **Containerization**: Docker & Docker Compose
- **Cloud Deployment**: AWS with Terraform (Lambda maintained; EKS planned; ECS deprecated — see `infra/README.md`)
- **Infrastructure as Code**: Terraform modules for scalable deployment

## 📋 Services

| Service | Technology | Port | Description |
|---------|------------|------|-------------|
| **Eureka Server** | Spring Boot | 8761 | Service discovery and registration |
| **Gateway Service** | Spring Cloud Gateway + Java 22 | 8081 | Single entry point — routes `/<service>/**` to `lb://<SERVICE>` via Eureka |
| **Java Service** | Spring Boot 3 + Java 22 | 8080 | REST API with database integration |
| **Node Service** | Express.js + Node 22 | 3000 | Lightweight API service |
| **Python Service** | Flask + Python 3.11 | 5001 | Data processing service |
| **Go Service** | chi router + Go 1.22 | 5002 | Go API service with Eureka registration (raw REST client) |
| **.NET Service** | ASP.NET Core 8 + C# 12 | 5003 | Contract-first .NET service with Eureka registration (Steeltoe client) |
| **MySQL Database** | MySQL 8.0 | 3306 | Persistent data storage |
| **Redis** | Redis 7 Alpine | 6379 | Cache backing for caching patterns |
| **RabbitMQ** | RabbitMQ 3.13 (management) | 5672 / 15672 | Message broker for the messaging patterns (management UI on 15672) |

### Simplified Services

Each full service has a `demo-simple-*` counterpart (`demo-simple-java-service`, `demo-simple-node-service`, `demo-simple-python-service`, `demo-simple-go-service`) — a minimal same-contract variant (`GET /info`, `POST /process`) for comparing the skeleton across languages. They are not wired into docker-compose; see `ADDING_A_MICROSERVICE.md` for the family rules.

.NET enters at the **contract-first** tier: `demo-dotnet-service` implements the contract (`/info`, `/health`, `POST /process`) plus Eureka registration through a real client (Steeltoe — guide Step 4a), but no pattern catalog yet. It is the seed shape a new language starts from before growing to the full family.

### Lambda Functions
- **Java Lambda**: Serverless Spring Boot application
- **Node Lambda**: Lightweight serverless function
- **Python Lambda**: Data processing serverless function

## 🚀 Quick Start

### Prerequisites

- **Docker & Docker Compose**
- **Version Managers** (for local development):
  - SDKMAN (Java)
  - NVM (Node.js)
  - pyenv (Python)
- **AWS CLI** (for cloud deployment)
- **Terraform** (for infrastructure)

### 1. Docker Deployment (Recommended)

```bash
# Clone and navigate
git clone <repository-url>
cd demo-microservices

# Start all services
./run.sh docker
# or on Windows
run.bat docker
```

**Service URLs:**
- Eureka Dashboard: http://localhost:8761
- Gateway (single entry point): http://localhost:8081 — e.g. `POST /java/process`, `GET /go/info`; route table at http://localhost:8081/actuator/gateway/routes
- Java Service API: http://localhost:8080/swagger-ui.html
- Node Service API: http://localhost:3000/api-docs
- Python Service API: http://localhost:5001/apidocs
- Go Service API: http://localhost:5002/info
- .NET Service API: http://localhost:5003/info
- RabbitMQ Management UI: http://localhost:15672 (credentials in `.env`) — watch the `orders` queue from the Go messaging patterns

### 2. Local Development

```bash
# Setup with specific versions
./run.sh local --java-version 22 --node-version 22 --python-version 3.11

# Or use defaults
./run.sh local
```

### 3. AWS Cloud Deployment

```bash
# Deploy only Lambda functions (maintained path — builds the zip artifacts first)
./run.sh lambda
```

> The legacy `./run.sh aws` (root `infra/` Terraform) is **deprecated** and now fails fast with a pointer. See `infra/README.md` for the status of every stack; the EKS path lands in `infra/eks`.

## 🛠️ Development

### Environment Configuration

Copy and customize the environment file:
```bash
cp .env.example .env
```

Key environment variables:
```env
# Database
MYSQL_ROOT_PASSWORD=rootpass
MYSQL_DATABASE=appdb
MYSQL_USER=appuser
MYSQL_PASSWORD=apppass

# Spring Boot
SPRING_DATASOURCE_URL=jdbc:mysql://mysql:3306/appdb
EUREKA_SERVER_URL=http://eureka-server:8761/eureka/
```

### API Endpoints

All services expose similar endpoints for consistency:

#### Common Endpoints
- `GET /info` - Service health and metadata
- `POST /process` - Process data (doubles input value)

#### Example Request
```bash
curl -X POST http://localhost:8080/process \
  -H "Content-Type: application/json" \
  -d '{"value": 10}'

# Response: {"result": 20}
```

### Service Discovery

Services automatically register with Eureka Server:
- Java Service: `JAVA-SERVICE`
- Node Service: `NODE-SERVICE`  
- Python Service: `PYTHON-SERVICE`
- Go Service: `GO-SERVICE`
- .NET Service: `DOTNET-SERVICE`

## 🏗️ Infrastructure

### Terraform Modules

```
infra/
├── modules/
│   ├── vpc/          # VPC, subnets, gateways
│   └── instances/    # EC2, security groups
├── docker/           # ECS deployment — DEPRECATED (broken; quarantined)
├── serverless/       # Lambda deployment — MAINTAINED
├── *.tf              # Root stack — DEPRECATED
└── README.md         # Read first: status of every stack
```

### AWS Resources Created (legacy stacks — see `infra/README.md` for what is maintained)

- **VPC** with public/private subnets
- **ECS Cluster** for containerized services
- **RDS MySQL** instance
- **Lambda Functions** for serverless compute
- **API Gateway** for Lambda endpoints
- **S3 Buckets** for artifacts and state
- **IAM Roles** with least privilege access

## 🔧 Configuration

### Version Management

The run scripts automatically manage language versions:

```bash
# Java with SDKMAN
sdk install java 22
sdk use java 22

# Node.js with NVM
nvm install 22
nvm use 22

# Python with pyenv
pyenv install 3.11
pyenv global 3.11
```

### Docker Compose Services

```yaml
services:
  eureka-server:    # Service discovery
  gateway-service:  # Spring Cloud Gateway (entry point, lb:// routes)
  java-service:     # Spring Boot API
  node-service:     # Express.js API
  python-service:   # Flask API
  go-service:       # Go (chi) API
  dotnet-service:   # .NET (ASP.NET Core) API
  redis:           # Cache for the caching patterns
  rabbitmq:        # Message broker for the messaging patterns (management UI :15672)
  mysql:           # Database with health checks
```

## 📊 Monitoring & Health Checks

### Health Endpoints
- Eureka: http://localhost:8761/actuator/health
- Java Service: http://localhost:8080/actuator/health
- Node Service: http://localhost:3000/info
- Python Service: http://localhost:5001/info
- Go Service: http://localhost:5002/health
- .NET Service: http://localhost:5003/health

### Docker Health Checks
- **MySQL**: `mysqladmin ping` with retry logic
- **Eureka Server**: HTTP health check with 12 retries
- **Java Service**: Actuator health endpoint monitoring
- **All Services**: Dependency-based startup ordering
- **Automatic Restart**: `unless-stopped` policy for resilience

### Service Dependencies
```yaml
# Startup order ensures proper service registration
Eureka Server → Database → Application Services
```

## 🔒 Security Features ✅

### Implemented Security Measures
- **No Hardcoded Credentials**: All secrets use environment variables
- **JWT Security**: Configurable JWT secrets with production warnings
- **Input Validation**: Request validation and sanitization
- **Environment Configuration**: Secure defaults with .env.security template
- **Docker Security**: All services configured with environment variables
- **Persistent Storage**: Secure outbox pattern implementation
- **Code Injection Prevention**: All user inputs properly sanitized
- **Database Security**: Parameterized queries and connection encryption

### Production Recommendations
- Enable HTTPS/TLS with SSL certificates
- Implement API authentication (JWT/OAuth2)
- Use AWS Secrets Manager for credential rotation
- Enable AWS CloudTrail for audit logging
- Implement rate limiting and DDoS protection
- Add Web Application Firewall (WAF)
- Enable VPC Flow Logs for network monitoring

## 🚀 Deployment Strategies

### 1. Local Development
```bash
./run.sh local
```
- Direct service execution
- Hot reloading for development
- Local MySQL container

### 2. Docker Compose
```bash
./run.sh docker
```
- Full containerization
- Service orchestration
- Production-like environment

### 3. AWS ECS (deprecated)
The legacy ECS stack (`infra/docker`) is deprecated and quarantined — `./run.sh aws` fails fast with a pointer. The maintained AWS path today is Lambda (`./run.sh lambda`); EKS lands in `infra/eks`.

### 4. AWS Lambda
```bash
./run.sh lambda
```
- Serverless compute
- Event-driven architecture
- Cost-effective for sporadic workloads

## 📈 Scaling Considerations

### Horizontal Scaling
- Multiple service instances behind load balancer
- Database read replicas
- Eureka clustering for high availability

### Vertical Scaling
- Adjust container resource limits
- Database instance sizing
- Lambda memory allocation

## 🧪 Testing

### Service Testing
```bash
# Java Service
cd demo-java-service && ./mvnw test

# Node Service  
cd demo-node-service && npm test

# Python Service
cd demo-python-service && python -m pytest tests/ -q

# Go Service (build is the smoke test)
cd demo-go-service && go build ./...

# .NET Service (build is the smoke test)
cd demo-dotnet-service && dotnet build
```

CI (`.github/workflows/ci.yml`) runs every service family's build and tests on push and PR.

### Integration Testing
```bash
# Test service communication
curl http://localhost:8761/eureka/apps
```

## 📚 Technology Stack

### Backend Services
- **Java**: Spring Boot 3.3.1, Spring Cloud 2023.0.2, Java 22
- **Node.js**: Express 4.21.1, Eureka JS Client, Node 22
- **Python**: Flask 3.0.0, py-eureka-client, Python 3.11
- **Go**: chi v5, Eureka over raw REST (`internal/eureka`), Go 1.22
- **C#**: ASP.NET Core 8 minimal API, Steeltoe Eureka client, .NET 8

### Infrastructure & Security
- **Containerization**: Docker, Docker Compose with health checks
- **Cloud**: AWS (ECS, Lambda, RDS with encryption, API Gateway)
- **IaC**: Terraform with modular design and sensitive variables
- **Database**: MySQL 8.0 with encryption and backup retention
- **Security**: Encrypted storage, restricted security groups, input validation

### Development Tools
- **API Documentation**: Swagger/OpenAPI 3.0
- **Version Management**: SDKMAN, NVM, pyenv
- **Build Tools**: Maven, npm, pip, go, dotnet
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)
- **Deployment**: Multi-environment scripts (run.sh/run.bat)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Services not registering with Eureka:**
- Check network connectivity between containers
- Verify Eureka server is healthy before starting services
- Review service configuration for correct Eureka URL
- Check Docker health checks are passing

**Database connection failures:**
- Ensure MySQL container is running and healthy
- Verify database credentials in `.env` file
- Check network connectivity between services and database
- Confirm RDS encryption is properly configured

**Port conflicts:**
- Ensure ports 3000, 5001, 5002, 5003, 8080, 8081, 8761, 3306, 6379 are available
- Modify port mappings in `docker-compose.yml` if needed
- Check security group rules for AWS deployments

**AWS deployment issues:**
- Verify AWS credentials and permissions (marked as sensitive)
- Check Terraform state and plan output
- Review CloudWatch logs for service errors
- Ensure EBS and RDS encryption is enabled
- Validate security group configurations

**Dependency vulnerabilities:**
- Run `npm audit fix` for Node.js services
- Update Python packages: `pip install --upgrade -r requirements.txt`
- Check for Spring Boot security updates

### Logs and Debugging

```bash
# Docker logs
docker-compose logs -f [service-name]

# AWS CloudWatch logs
aws logs tail /aws/lambda/[function-name] --follow

# Local service logs
# Check individual service console output
```

## 🔗 Useful Links

- [Spring Boot Documentation](https://spring.io/projects/spring-boot)
- [Express.js Guide](https://expressjs.com/)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [Netflix Eureka](https://github.com/Netflix/eureka)
- [Docker Compose](https://docs.docker.com/compose/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)