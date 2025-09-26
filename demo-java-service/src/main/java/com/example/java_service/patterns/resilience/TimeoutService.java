package com.example.java_service.patterns.resilience;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.*;
import java.util.function.Supplier;

@Service
public class TimeoutService {
    
    private static final Logger logger = LoggerFactory.getLogger(TimeoutService.class);
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public <T> T executeWithTimeout(Supplier<T> supplier, Duration timeout) {
        return executeWithTimeout("default", supplier, timeout);
    }
    
    public <T> T executeWithTimeout(String name, Supplier<T> supplier, Duration timeout) {
        metrics.put(name + "_executions", 
            metrics.getOrDefault(name + "_executions", 0L) + 1);
            
        CompletableFuture<T> future = CompletableFuture.supplyAsync(supplier, executor);
        
        try {
            T result = future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            metrics.put(name + "_successes", 
                metrics.getOrDefault(name + "_successes", 0L) + 1);
            return result;
        } catch (TimeoutException e) {
            future.cancel(true);
            metrics.put(name + "_timeouts", 
                metrics.getOrDefault(name + "_timeouts", 0L) + 1);
            logger.warn("Operation {} timed out after {}ms", name, timeout.toMillis());
            throw new RuntimeException("Operation timed out after " + timeout.toMillis() + "ms", e);
        } catch (Exception e) {
            metrics.put(name + "_failures", 
                metrics.getOrDefault(name + "_failures", 0L) + 1);
            throw new RuntimeException(e);
        }
    }
    
    public Map<String, Object> getTimeoutStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        
        // Calculate timeout rates
        metrics.entrySet().stream()
            .filter(entry -> entry.getKey().endsWith("_executions"))
            .forEach(entry -> {
                String baseName = entry.getKey().replace("_executions", "");
                long executions = entry.getValue();
                long timeouts = metrics.getOrDefault(baseName + "_timeouts", 0L);
                
                if (executions > 0) {
                    double timeoutRate = (double) timeouts / executions * 100;
                    stats.put(baseName + "_timeout_rate", timeoutRate);
                }
            });
            
        return stats;
    }
    
    public void shutdown() {
        executor.shutdown();
    }
}