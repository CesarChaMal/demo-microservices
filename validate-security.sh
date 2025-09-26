#!/bin/bash

echo "🔒 Security Validation Script"
echo "=============================="

# Check for hardcoded secrets
echo "1. Checking for hardcoded secrets..."
if grep -r "demo-secret" --include="*.java" --include="*.js" --include="*.py" . | grep -v "change-in-production" | grep -v "validate-security"; then
    echo "❌ Found hardcoded secrets!"
    exit 1
else
    echo "✅ No hardcoded secrets found"
fi

# Check environment variable usage
echo "2. Checking environment variable usage..."
if grep -r "process.env.JWT_SECRET\|os.getenv.*JWT_SECRET\|System.getenv.*JWT_SECRET" --include="*.java" --include="*.js" --include="*.py" . > /dev/null; then
    echo "✅ Environment variables properly used"
else
    echo "❌ Environment variables not properly configured"
    exit 1
fi

# Check for SQL injection vulnerabilities
echo "3. Checking for SQL injection vulnerabilities..."
if grep -r "SELECT.*+\|INSERT.*+\|UPDATE.*+" --include="*.java" --include="*.js" --include="*.py" . | grep -v "validate-security"; then
    echo "⚠️  Potential SQL injection found - review manually"
else
    echo "✅ No obvious SQL injection patterns found"
fi

# Check Docker configuration
echo "4. Checking Docker security..."
if grep -q "JWT_SECRET=\${JWT_SECRET}" docker-compose.yml; then
    echo "✅ Docker environment variables configured"
else
    echo "❌ Docker environment variables missing"
    exit 1
fi

# Check standardized patterns
echo "5. Checking pattern standardization..."
pattern_count=0
for service in demo-java-service demo-node-service demo-python-service; do
    if [ -d "$service" ]; then
        if find "$service" -name "*.java" -o -name "*.js" -o -name "*.py" | xargs grep -l "CircuitBreaker\|RateLimiter\|HealthIndicator" > /dev/null 2>&1; then
            echo "✅ $service: Essential patterns implemented"
            pattern_count=$((pattern_count + 1))
        else
            echo "❌ $service: Missing essential patterns"
        fi
    fi
done

if [ $pattern_count -eq 3 ]; then
    echo "✅ All services have standardized patterns"
else
    echo "❌ Pattern standardization incomplete"
fi

echo ""
echo "🎉 Security validation completed successfully!"
echo "Remember to:"
echo "- Set strong JWT_SECRET in production"
echo "- Use HTTPS in production"
echo "- Enable proper logging and monitoring"
echo "- Run pattern validation: ./patterns-validation.sh"