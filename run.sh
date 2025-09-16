#!/bin/bash

# Demo Microservices Launcher Script
# Supports multiple deployment stacks with version management

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default versions
JAVA_VERSION="22"
NODE_VERSION="20"
PYTHON_VERSION="3.11"

print_usage() {
    echo -e "${BLUE}Usage: $0 [STACK] [OPTIONS]${NC}"
    echo ""
    echo "STACKS:"
    echo "  docker     - Run all services with Docker Compose"
    echo "  local      - Run services locally with version managers"
    echo "  aws        - Deploy to AWS (Terraform)"
    echo "  lambda     - Deploy Lambda functions only"
    echo ""
    echo "OPTIONS:"
    echo "  --java-version VERSION    Java version (default: $JAVA_VERSION)"
    echo "  --node-version VERSION    Node.js version (default: $NODE_VERSION)"
    echo "  --python-version VERSION  Python version (default: $PYTHON_VERSION)"
    echo "  --help                    Show this help"
}

setup_java() {
    echo -e "${YELLOW}Setting up Java $JAVA_VERSION...${NC}"
    if command -v sdk &> /dev/null; then
        sdk use java $JAVA_VERSION || sdk install java $JAVA_VERSION
    else
        echo -e "${RED}SDKMAN not found. Please install: curl -s https://get.sdkman.io | bash${NC}"
        exit 1
    fi
}

setup_node() {
    echo -e "${YELLOW}Setting up Node.js $NODE_VERSION...${NC}"
    if command -v nvm &> /dev/null; then
        nvm use $NODE_VERSION || nvm install $NODE_VERSION
    else
        echo -e "${RED}NVM not found. Please install: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash${NC}"
        exit 1
    fi
}

setup_python() {
    echo -e "${YELLOW}Setting up Python $PYTHON_VERSION...${NC}"
    if command -v pyenv &> /dev/null; then
        pyenv global $PYTHON_VERSION || pyenv install $PYTHON_VERSION
    else
        echo -e "${RED}pyenv not found. Please install: curl https://pyenv.run | bash${NC}"
        exit 1
    fi
}

run_docker_stack() {
    echo -e "${GREEN}Starting Docker stack...${NC}"
    docker-compose up --build -d
    echo -e "${GREEN}Services started:${NC}"
    echo "  - Eureka Server: http://localhost:8761"
    echo "  - Java Service: http://localhost:8080"
    echo "  - Node Service: http://localhost:3000"
    echo "  - Python Service: http://localhost:5001"
    echo "  - MySQL: localhost:3306"
}

run_local_stack() {
    echo -e "${GREEN}Starting local development stack...${NC}"
    
    setup_java
    setup_node
    setup_python
    
    # Start MySQL (assuming Docker for database)
    docker run -d --name mysql-local -p 3306:3306 \
        -e MYSQL_ROOT_PASSWORD=rootpass \
        -e MYSQL_DATABASE=appdb \
        -e MYSQL_USER=appuser \
        -e MYSQL_PASSWORD=apppass \
        mysql:8.0 || echo "MySQL container already running"
    
    # Start services in background
    echo -e "${YELLOW}Starting Eureka Server...${NC}"
    cd demo-eureka-server && ./mvnw spring-boot:run &
    
    sleep 10
    
    echo -e "${YELLOW}Starting Java Service...${NC}"
    cd ../demo-java-service && ./mvnw spring-boot:run &
    
    echo -e "${YELLOW}Starting Node Service...${NC}"
    cd ../demo-node-service && npm start &
    
    echo -e "${YELLOW}Starting Python Service...${NC}"
    cd ../demo-python-service && pip install -r requirements.txt && python app.py &
    
    echo -e "${GREEN}Local stack started. Press Ctrl+C to stop all services.${NC}"
    wait
}

deploy_aws_stack() {
    echo -e "${GREEN}Deploying to AWS...${NC}"
    cd infra
    terraform init
    terraform plan
    terraform apply -auto-approve
}

deploy_lambda_stack() {
    echo -e "${GREEN}Deploying Lambda functions...${NC}"
    cd infra/serverless
    terraform init
    terraform plan
    terraform apply -auto-approve
}

# Parse arguments
STACK=""
while [[ $# -gt 0 ]]; do
    case $1 in
        docker|local|aws|lambda)
            STACK="$1"
            shift
            ;;
        --java-version)
            JAVA_VERSION="$2"
            shift 2
            ;;
        --node-version)
            NODE_VERSION="$2"
            shift 2
            ;;
        --python-version)
            PYTHON_VERSION="$2"
            shift 2
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

if [[ -z "$STACK" ]]; then
    print_usage
    exit 1
fi

case $STACK in
    docker)
        run_docker_stack
        ;;
    local)
        run_local_stack
        ;;
    aws)
        deploy_aws_stack
        ;;
    lambda)
        deploy_lambda_stack
        ;;
esac