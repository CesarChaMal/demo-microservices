# Demo Microservices

A comprehensive microservices architecture demonstration featuring multiple deployment strategies, service discovery, and cloud-native patterns.

## 🏗️ Architecture Overview

This project demonstrates a complete microservices ecosystem with:

- **Service Discovery**: Netflix Eureka Server
- **Multiple Technology Stacks**: Java (Spring Boot), Node.js (Express), Python (Flask)
- **Database**: MySQL with connection pooling
- **API Documentation**: Swagger/OpenAPI integration
- **Containerization**: Docker & Docker Compose
- **Cloud Deployment**: AWS with Terraform (ECS, Lambda, RDS)
- **Infrastructure as Code**: Terraform modules for scalable deployment

## 📋 Services

| Service | Technology | Port | Description |
|---------|------------|------|-------------|
| **Eureka Server** | Spring Boot | 8761 | Service discovery and registration |
| **Java Service** | Spring Boot 3 + Java 22 | 8080 | REST API with database integration |
| **Node Service** | Express.js + Node 20 | 3000 | Lightweight API service |
| **Python Service** | Flask + Python 3.11 | 5001 | Data processing service |
| **MySQL Database** | MySQL 8.0 | 3306 | Persistent data storage |

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
- Java Service API: http://localhost:8080/swagger-ui.html
- Node Service API: http://localhost:3000/api-docs
- Python Service API: http://localhost:5001/apidocs

### 2. Local Development

```bash
# Setup with specific versions
./run.sh local --java-version 22 --node-version 20 --python-version 3.11

# Or use defaults
./run.sh local
```

### 3. AWS Cloud Deployment

```bash
# Deploy full infrastructure
./run.sh aws

# Deploy only Lambda functions
./run.sh lambda
```

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

## 🏗️ Infrastructure

### Terraform Modules

```
infra/
├── modules/
│   ├── vpc/          # VPC, subnets, gateways
│   └── instances/    # EC2, security groups
├── docker/           # ECS deployment
├── serverless/       # Lambda deployment
└── *.tf             # Main infrastructure
```

### AWS Resources Created

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
nvm install 20
nvm use 20

# Python with pyenv
pyenv install 3.11
pyenv global 3.11
```

### Docker Compose Services

```yaml
services:
  eureka-server:    # Service discovery
  java-service:     # Spring Boot API
  node-service:     # Express.js API
  python-service:   # Flask API
  mysql:           # Database with health checks
```

## 📊 Monitoring & Health Checks

### Health Endpoints
- Eureka: http://localhost:8761/actuator/health
- Java Service: http://localhost:8080/actuator/health
- All Services: `/info` endpoint

### Docker Health Checks
- MySQL: `mysqladmin ping`
- Eureka: HTTP health check with retries
- Services: Dependency-based startup ordering

## 🔒 Security Considerations

### Current Implementation
- Environment-based configuration
- Docker network isolation
- AWS IAM role-based access
- Security groups for network access

### Recommendations
- Enable HTTPS/TLS in production
- Implement API authentication (JWT/OAuth2)
- Use AWS Secrets Manager for credentials
- Enable database encryption at rest
- Implement CSRF protection for web endpoints

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

### 3. AWS ECS
```bash
./run.sh aws
```
- Managed container orchestration
- Auto-scaling capabilities
- Load balancing

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
cd demo-python-service && python -m pytest
```

### Integration Testing
```bash
# Test service communication
curl http://localhost:8761/eureka/apps
```

## 📚 Technology Stack

### Backend Services
- **Java**: Spring Boot 3, Spring Cloud, Maven
- **Node.js**: Express.js, Eureka JS Client, Swagger
- **Python**: Flask, py-eureka-client, Flasgger

### Infrastructure
- **Containerization**: Docker, Docker Compose
- **Cloud**: AWS (ECS, Lambda, RDS, API Gateway)
- **IaC**: Terraform with modular design
- **Database**: MySQL 8.0 with connection pooling

### Development Tools
- **API Documentation**: Swagger/OpenAPI 3.0
- **Version Management**: SDKMAN, NVM, pyenv
- **Build Tools**: Maven, npm, pip

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

**Database connection failures:**
- Ensure MySQL container is running and healthy
- Verify database credentials in `.env` file
- Check network connectivity between services and database

**Port conflicts:**
- Ensure ports 3000, 5001, 8080, 8761, 3306 are available
- Modify port mappings in `docker-compose.yml` if needed

**AWS deployment issues:**
- Verify AWS credentials and permissions
- Check Terraform state and plan output
- Review CloudWatch logs for service errors

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