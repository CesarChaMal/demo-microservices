package com.example.java_service.idempotency;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class IdempotencyService {
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    private static final String IDEMPOTENCY_PREFIX = "idempotency:";
    private static final Duration DEFAULT_TTL = Duration.ofHours(24);
    
    public <T> T executeIdempotent(String idempotencyKey, Supplier<T> operation, Class<T> resultType) {
        String key = IDEMPOTENCY_PREFIX + idempotencyKey;
        
        // Check if operation already executed
        String existingResult = redisTemplate.opsForValue().get(key);
        if (existingResult != null) {
            return deserialize(existingResult, resultType);
        }
        
        // Execute operation
        T result = operation.get();
        
        // Store result with TTL
        redisTemplate.opsForValue().set(key, serialize(result), DEFAULT_TTL);
        
        return result;
    }
    
    public boolean isProcessed(String idempotencyKey) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(IDEMPOTENCY_PREFIX + idempotencyKey));
    }
    
    public void markProcessed(String idempotencyKey, Object result) {
        String key = IDEMPOTENCY_PREFIX + idempotencyKey;
        redisTemplate.opsForValue().set(key, serialize(result), DEFAULT_TTL);
    }
    
    public String generateKey(String... components) {
        return String.join(":", components) + ":" + UUID.randomUUID().toString();
    }
    
    private String serialize(Object obj) {
        // Simple serialization - in production use Jackson
        return obj.toString();
    }
    
    @SuppressWarnings("unchecked")
    private <T> T deserialize(String value, Class<T> type) {
        // Simple deserialization - in production use Jackson
        return (T) value;
    }
}