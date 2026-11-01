@echo off
setlocal enabledelayedexpansion

REM Demo Microservices Launcher Script for Windows
REM Supports multiple deployment stacks with version management

set "JAVA_VERSION=22"
set "NODE_VERSION=22"
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
echo Setting up Java...

REM Initialize SDKMAN for Windows
if exist "%USERPROFILE%\.sdkman\bin\sdkman-init.sh" (
    call "%USERPROFILE%\.sdkman\bin\sdkman-init.sh"
)

where sdk >nul 2>&1
if errorlevel 1 (
    where java >nul 2>&1
    if not errorlevel 1 (
        for /f "tokens=3" %%i in ('java -version 2^>^&1 ^| findstr "version"') do set CURRENT_JAVA=%%i
        set CURRENT_JAVA=!CURRENT_JAVA:"=!
        echo Using local Java version: !CURRENT_JAVA!
    ) else (
        echo Java not found. Install SDKMAN: https://sdkman.io/
        exit /b 1
    )
) else (
    REM Try configured Java version first, then 11
    sdk use java %JAVA_VERSION%.fx-zulu >nul 2>&1 || sdk use java %JAVA_VERSION%-zulu >nul 2>&1
    if not errorlevel 1 (
        echo Using Java %JAVA_VERSION% via SDKMAN
    ) else (
        sdk use java 11.fx-zulu >nul 2>&1 || sdk use java 11-zulu >nul 2>&1
        if not errorlevel 1 (
            echo Using Java 11 via SDKMAN
        ) else (
            echo Installing Java %JAVA_VERSION%-zulu via SDKMAN...
            sdk install java %JAVA_VERSION%-zulu
            sdk use java %JAVA_VERSION%-zulu
        )
    )
)
goto :eof

:setup_node
echo Setting up Node.js...

REM Initialize NVM for Windows
if exist "%APPDATA%\nvm\nvm.exe" (
    set "PATH=%APPDATA%\nvm;%PATH%"
)

where nvm >nul 2>&1
if errorlevel 1 (
    where node >nul 2>&1
    if not errorlevel 1 (
        for /f "tokens=1" %%i in ('node -v') do set CURRENT_NODE=%%i
        echo Using local Node.js version: !CURRENT_NODE!
    ) else (
        echo Node.js not found. Install NVM: https://github.com/coreybutler/nvm-windows
        exit /b 1
    )
) else (
    REM Try configured Node.js version first, then 18
    nvm use %NODE_VERSION% >nul 2>&1
    if not errorlevel 1 (
        echo Using Node.js %NODE_VERSION% via NVM
    ) else (
        nvm use 18 >nul 2>&1
        if not errorlevel 1 (
            echo Using Node.js 18 via NVM
        ) else (
            echo Installing Node.js %NODE_VERSION% via NVM...
            nvm install %NODE_VERSION%
            nvm use %NODE_VERSION%
        )
    )
)
goto :eof

:setup_python
echo Setting up Python...

REM Initialize pyenv for Windows
if exist "%USERPROFILE%\.pyenv\pyenv-win\bin" (
    set "PATH=%USERPROFILE%\.pyenv\pyenv-win\bin;%USERPROFILE%\.pyenv\pyenv-win\shims;%PATH%"
)

where pyenv >nul 2>&1
if errorlevel 1 (
    where python >nul 2>&1
    if not errorlevel 1 (
        for /f "tokens=2" %%i in ('python --version 2^>^&1') do set CURRENT_PYTHON=%%i
        echo Using local Python version: !CURRENT_PYTHON!
    ) else (
        echo Python not found. Install pyenv: https://github.com/pyenv-win/pyenv-win
        exit /b 1
    )
) else (
    REM Try configured Python version first, then 3.13
    pyenv global %PYTHON_VERSION% >nul 2>&1
    if not errorlevel 1 (
        echo Using Python %PYTHON_VERSION% via pyenv
    ) else (
        pyenv global 3.13 >nul 2>&1
        if not errorlevel 1 (
            echo Using Python 3.13 via pyenv
        ) else (
            echo Installing Python %PYTHON_VERSION% via pyenv...
            pyenv install %PYTHON_VERSION%
            pyenv global %PYTHON_VERSION%
        )
    )
)
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
echo [ERROR] The legacy 'aws' stack (infra\ root Terraform) is DEPRECATED and does not plan cleanly.
echo Maintained AWS paths: 'run.bat lambda' (infra\serverless) today; infra\eks when it lands.
echo See infra\README.md for the status of every stack.
exit /b 1

:deploy_lambda_stack
where bash >nul 2>nul
if %errorlevel%==0 (
    echo Building Lambda zip artifacts...
    bash scripts\build-lambda-zips.sh
) else (
    echo [WARN] bash not found - skipping zip build; run scripts\build-lambda-zips.sh manually
)
echo Deploying Lambda functions...
cd infra\serverless
terraform init
terraform plan
terraform apply -auto-approve
cd ..\..
goto :eof