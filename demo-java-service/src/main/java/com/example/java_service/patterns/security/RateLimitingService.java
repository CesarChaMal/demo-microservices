package com.example.java_service.patterns.security;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class RateLimitingService {
    
    private static final Logger logger = LoggerFactory.getLogger(RateLimitingService.class);
    private final Map<String, TokenBucket> buckets = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public boolean isAllowed(String key, int maxRequests, int windowSeconds) {
        TokenBucket bucket = buckets.computeIfAbsent(key, 
            k -> new TokenBucket(maxRequests, windowSeconds));
            
        boolean allowed = bucket.tryConsume();
        
        if (allowed) {
            metrics.put("requests_allowed", metrics.getOrDefault("requests_allowed", 0L) + 1);
        } else {
            metrics.put("requests_rejected", metrics.getOrDefault("requests_rejected", 0L) + 1);
            logger.warn("Rate limit exceeded for key: {}", key);
        }
        
        return allowed;
    }
    
    public Map<String, Object> getRateLimitStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        stats.put("active_buckets", buckets.size());
        
        // Calculate rejection rate
        long allowed = metrics.getOrDefault("requests_allowed", 0L);
        long rejected = metrics.getOrDefault("requests_rejected", 0L);
        long total = allowed + rejected;
        
        if (total > 0) {
            stats.put("rejection_rate", (double) rejected / total * 100);
        }
        
        return stats;
    }
    
    private static class TokenBucket {
        private final int capacity;
        private final int refillRate;
        private final AtomicInteger tokens;
        private volatile Instant lastRefill;
        
        public TokenBucket(int capacity, int windowSeconds) {
            this.capacity = capacity;
            this.refillRate = capacity / windowSeconds;
            this.tokens = new AtomicInteger(capacity);
            this.lastRefill = Instant.now();
        }
        
        public synchronized boolean tryConsume() {
            refillTokens();
            
            if (tokens.get() > 0) {
                tokens.decrementAndGet();
                return true;
            }
            
            return false;
        }
        
        private void refillTokens() {
            Instant now = Instant.now();
            long secondsSinceLastRefill = java.time.Duration.between(lastRefill, now).getSeconds();
            
            if (secondsSinceLastRefill > 0) {
                int tokensToAdd = (int) Math.min(secondsSinceLastRefill * refillRate, 
                    capacity - tokens.get());
                
                if (tokensToAdd > 0) {
                    tokens.addAndGet(tokensToAdd);
                    lastRefill = now;
                }
            }
        }
    }
}