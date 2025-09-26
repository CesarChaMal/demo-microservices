package com.example.java_service.lock;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Collections;
import java.util.UUID;

@Service
public class RedisDistributedLock {
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    private static final String UNLOCK_SCRIPT = 
        "if redis.call('get', KEYS[1]) == ARGV[1] then " +
        "    return redis.call('del', KEYS[1]) " +
        "else " +
        "    return 0 " +
        "end";
    
    public String acquireLock(String lockKey, Duration expiration) {
        String lockValue = UUID.randomUUID().toString();
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, lockValue, expiration);
        return Boolean.TRUE.equals(acquired) ? lockValue : null;
    }
    
    public boolean releaseLock(String lockKey, String lockValue) {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setScriptText(UNLOCK_SCRIPT);
        script.setResultType(Long.class);
        
        Long result = redisTemplate.execute(script, Collections.singletonList(lockKey), lockValue);
        return result != null && result == 1L;
    }
    
    public <T> T executeWithLock(String lockKey, Duration expiration, LockCallback<T> callback) {
        String lockValue = acquireLock(lockKey, expiration);
        if (lockValue == null) {
            throw new LockAcquisitionException("Failed to acquire lock: " + lockKey);
        }
        
        try {
            return callback.execute();
        } finally {
            releaseLock(lockKey, lockValue);
        }
    }
    
    @FunctionalInterface
    public interface LockCallback<T> {
        T execute();
    }
    
    public static class LockAcquisitionException extends RuntimeException {
        public LockAcquisitionException(String message) {
            super(message);
        }
    }
}