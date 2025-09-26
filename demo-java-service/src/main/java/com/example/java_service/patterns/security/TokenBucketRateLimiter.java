package com.example.java_service.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Bucket4j;
import io.github.bucket4j.Refill;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TokenBucketRateLimiter {
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    
    public boolean isAllowed(String key, int tokensPerMinute) {
        Bucket bucket = buckets.computeIfAbsent(key, k -> createBucket(tokensPerMinute));
        return bucket.tryConsume(1);
    }
    
    public boolean isAllowed(String key, int tokens, int tokensPerMinute) {
        Bucket bucket = buckets.computeIfAbsent(key, k -> createBucket(tokensPerMinute));
        return bucket.tryConsume(tokens);
    }
    
    private Bucket createBucket(int tokensPerMinute) {
        Bandwidth limit = Bandwidth.classic(tokensPerMinute, 
            Refill.intervally(tokensPerMinute, Duration.ofMinutes(1)));
        return Bucket4j.builder().addLimit(limit).build();
    }
    
    public void resetBucket(String key) {
        buckets.remove(key);
    }
    
    public long getAvailableTokens(String key, int tokensPerMinute) {
        Bucket bucket = buckets.computeIfAbsent(key, k -> createBucket(tokensPerMinute));
        return bucket.getAvailableTokens();
    }
}