package com.example.java_service.controller;

import com.example.java_service.cache.CacheAsideService;
import com.example.java_service.lock.RedisDistributedLock;
import com.example.java_service.ratelimit.TokenBucketRateLimiter;
import com.example.java_service.dto.ValueRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v3")
public class AdvancedPatternsController {
    
    @Autowired
    private RedisDistributedLock distributedLock;
    
    @Autowired
    private TokenBucketRateLimiter rateLimiter;
    
    @Autowired
    private CacheAsideService cacheService;
    
    @PostMapping("/process-with-lock")
    public ResponseEntity<Map<String, Object>> processWithLock(@Valid @RequestBody ValueRequest request) {
        String lockKey = "process:" + request.getValue();
        
        try {
            return ResponseEntity.ok(distributedLock.executeWithLock(lockKey, Duration.ofMinutes(1), () -> {
                // Simulate processing
                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                
                return Map.of(
                    "result", request.getValue() * 2,
                    "processedBy", "locked-instance",
                    "lockKey", lockKey
                );
            }));
        } catch (RedisDistributedLock.LockAcquisitionException e) {
            return ResponseEntity.status(409).body(Map.of(
                "error", "Resource is being processed by another instance",
                "lockKey", lockKey
            ));
        }
    }
    
    @PostMapping("/process-cached")
    public ResponseEntity<Map<String, Object>> processWithCache(@Valid @RequestBody ValueRequest request) {
        String cacheKey = "cached:" + request.getValue();
        
        Map<String, Object> result = cacheService.get(cacheKey, Map.class, () -> {
            // Simulate expensive computation
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            
            return Map.of(
                "result", request.getValue() * 3,
                "computed", true,
                "timestamp", System.currentTimeMillis()
            );
        });
        
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/process-rate-limited")
    public ResponseEntity<Map<String, Object>> processWithRateLimit(
            @Valid @RequestBody ValueRequest request,
            HttpServletRequest httpRequest) {
        
        String clientId = getClientId(httpRequest);
        
        if (!rateLimiter.isAllowed(clientId, 10)) { // 10 requests per minute
            return ResponseEntity.status(429).body(Map.of(
                "error", "Rate limit exceeded",
                "clientId", clientId,
                "availableTokens", rateLimiter.getAvailableTokens(clientId, 10)
            ));
        }
        
        return ResponseEntity.ok(Map.of(
            "result", request.getValue() * 4,
            "clientId", clientId,
            "remainingTokens", rateLimiter.getAvailableTokens(clientId, 10)
        ));
    }
    
    @GetMapping("/cache-stats")
    public ResponseEntity<Map<String, Object>> getCacheStats() {
        return ResponseEntity.ok(Map.of(
            "cacheType", "Redis",
            "status", "active",
            "patterns", Map.of(
                "cache-aside", "implemented",
                "write-behind", "available"
            )
        ));
    }
    
    @DeleteMapping("/cache/{key}")
    public ResponseEntity<Map<String, Object>> evictCache(@PathVariable String key) {
        cacheService.evict("cached:" + key);
        return ResponseEntity.ok(Map.of(
            "message", "Cache evicted",
            "key", key
        ));
    }
    
    private String getClientId(HttpServletRequest request) {
        String clientId = request.getHeader("X-Client-ID");
        if (clientId == null) {
            clientId = request.getRemoteAddr();
        }
        return clientId;
    }
}