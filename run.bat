@echo off
setlocal enabledelayedexpansion

REM Demo Microservices Launcher Script for Windows
REM Supports multiple deployment stacks with version management

set "JAVA_VERSION=22"
set "NODE_VERSION=20"
set "PYTHON_VERSION=3.11"
set "STACK="

:parse_args
if "%~1"=="" goto check_stack
if "%~1"=="docker" (
    set "STACK=docker"
    shift
    goto parse_args
)
if "%~1"=="local" (
    set "STACK=local"
    shift
    goto parse_args
)
if "%~1"=="aws" (
    set "STACK=aws"
    shift
    goto parse_args
)
if "%~1"=="lambda" (
    set "STACK=lambda"
    shift
    goto parse_args
)
if "%~1"=="--java-version" (
    set "JAVA_VERSION=%~2"
    shift
    shift
    goto parse_args
)
if "%~1"=="--node-version" (
    set "NODE_VERSION=%~2"
    shift
    shift
    goto parse_args
)
if "%~1"=="--python-version" (
    set "PYTHON_VERSION=%~2"
    shift
    shift
    goto parse_args
)
if "%~1"=="--help" goto show_usage
echo Unknown option: %~1
goto show_usage

:check_stack
if "%STACK%"=="" goto show_usage

if "%STACK%"=="docker" goto run_docker_stack
if "%STACK%"=="local" goto run_local_stack
if "%STACK%"=="aws" goto deploy_aws_stack
if "%STACK%"=="lambda" goto deploy_lambda_stack

:show_usage
echo Usage: %0 [STACK] [OPTIONS]
echo.
echo STACKS:
echo   docker     - Run all services with Docker Compose
echo   local      - Run services locally with version managers
echo   aws        - Deploy to AWS (Terraform)
echo   lambda     - Deploy Lambda functions only
echo.
echo OPTIONS:
echo   --java-version VERSION    Java version (default: %JAVA_VERSION%)
echo   --node-version VERSION    Node.js version (default: %NODE_VERSION%)
echo   --python-version VERSION  Python version (default: %PYTHON_VERSION%)
echo   --help                    Show this help
exit /b 1

:setup_java
echo Setting up Java %JAVA_VERSION%...
where sdk >nul 2>&1
if errorlevel 1 (
    echo SDKMAN not found. Please install from https://sdkman.io/
    exit /b 1
)
sdk use java %JAVA_VERSION% || sdk install java %JAVA_VERSION%
goto :eof

:setup_node
echo Setting up Node.js %NODE_VERSION%...
where nvm >nul 2>&1
if errorlevel 1 (
    echo NVM not found. Please install from https://github.com/coreybutler/nvm-windows
    exit /b 1
)
nvm use %NODE_VERSION% || nvm install %NODE_VERSION%
goto :eof

:setup_python
echo Setting up Python %PYTHON_VERSION%...
where pyenv >nul 2>&1
if errorlevel 1 (
    echo pyenv not found. Please install from https://github.com/pyenv-win/pyenv-win
    exit /b 1
)
pyenv global %PYTHON_VERSION% || pyenv install %PYTHON_VERSION%
goto :eof

:run_docker_stack
echo Starting Docker stack...
docker-compose up --build -d
if errorlevel 1 (
    echo Failed to start Docker stack
    exit /b 1
)
echo Services started:
echo   - Eureka Server: http://localhost:8761
echo   - Java Service: http://localhost:8080
echo   - Node Service: http://localhost:3000
echo   - Python Service: http://localhost:5001
echo   - MySQL: localhost:3306
goto :eof

:run_local_stack
echo Starting local development stack...

call :setup_java
call :setup_node
call :setup_python

REM Start MySQL (assuming Docker for database)
docker run -d --name mysql-local -p 3306:3306 -e MYSQL_ROOT_PASSWORD=rootpass -e MYSQL_DATABASE=appdb -e MYSQL_USER=appuser -e MYSQL_PASSWORD=apppass mysql:8.0 2>nul || echo MySQL container already running

REM Start services
echo Starting Eureka Server...
cd demo-eureka-server
start "Eureka Server" cmd /c "mvnw.cmd spring-boot:run"
cd ..

timeout /t 10 /nobreak >nul

echo Starting Java Service...
cd demo-java-service
start "Java Service" cmd /c "mvnw.cmd spring-boot:run"
cd ..

echo Starting Node Service...
cd demo-node-service
start "Node Service" cmd /c "npm start"
cd ..

echo Starting Python Service...
cd demo-python-service
start "Python Service" cmd /c "pip install -r requirements.txt && python app.py"
cd ..

echo Local stack started. Check individual service windows.
pause
goto :eof

:deploy_aws_stack
echo Deploying to AWS...
cd infra
terraform init
terraform plan
terraform apply -auto-approve
cd ..
goto :eof

:deploy_lambda_stack
echo Deploying Lambda functions...
cd infra\serverless
terraform init
terraform plan
terraform apply -auto-approve
cd ..\..
goto :eof