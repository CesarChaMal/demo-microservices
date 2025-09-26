package com.example.java_service.patterns.performance;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

@Service
public class AsyncProcessingService {
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    @Async
    public CompletableFuture<Map<String, Object>> processAsync(Integer value) {
        metrics.put("async_tasks_started", metrics.getOrDefault("async_tasks_started", 0L) + 1);
        
        try {
            // Simulate long-running task
            Thread.sleep(1000);
            
            Map<String, Object> result = Map.of(
                "result", value * 2,
                "thread", Thread.currentThread().getName(),
                "async", true
            );
            
            metrics.put("async_tasks_completed", metrics.getOrDefault("async_tasks_completed", 0L) + 1);
            return CompletableFuture.completedFuture(result);
            
        } catch (Exception e) {
            metrics.put("async_tasks_failed", metrics.getOrDefault("async_tasks_failed", 0L) + 1);
            return CompletableFuture.failedFuture(e);
        }
    }
    
    public Map<String, Object> getAsyncStats() {
        return Map.of(
            "tasks_started", metrics.getOrDefault("async_tasks_started", 0L),
            "tasks_completed", metrics.getOrDefault("async_tasks_completed", 0L),
            "tasks_failed", metrics.getOrDefault("async_tasks_failed", 0L)
        );
    }
}