#!/bin/bash

echo "🔍 Pattern Gap Analysis"
echo "======================"

# Get Java patterns
echo "Java patterns:" > java_patterns.tmp
find demo-java-service/src/main/java/com/example/java_service/patterns -name "*.java" | while read file; do
    basename "$file" .java
done | sort >> java_patterns.tmp

# Get Node patterns  
echo "Node patterns:" > node_patterns.tmp
find demo-node-service/patterns -name "*.js" | while read file; do
    basename "$file" .js
done | sort >> node_patterns.tmp

# Get Python patterns
echo "Python patterns:" > python_patterns.tmp
find demo-python-service/patterns -name "*.py" | while read file; do
    basename "$file" .py
done | sort >> python_patterns.tmp

echo "📊 Patterns in Java but NOT in Node:"
echo "===================================="
comm -23 <(tail -n +2 java_patterns.tmp | sort) <(tail -n +2 node_patterns.tmp | sort)

echo ""
echo "📊 Patterns in Java but NOT in Python:"
echo "======================================"
comm -23 <(tail -n +2 java_patterns.tmp | sort) <(tail -n +2 python_patterns.tmp | sort)

echo ""
echo "📊 Patterns in Node but NOT in Java:"
echo "===================================="
comm -23 <(tail -n +2 node_patterns.tmp | sort) <(tail -n +2 java_patterns.tmp | sort)

echo ""
echo "📊 Patterns in Python but NOT in Java:"
echo "======================================"
comm -23 <(tail -n +2 python_patterns.tmp | sort) <(tail -n +2 java_patterns.tmp | sort)

# Cleanup
rm -f java_patterns.tmp node_patterns.tmp python_patterns.tmp