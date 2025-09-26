package com.example.java_service.patterns.resilience;

import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.retry.RetryRegistry;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

@Service
public class RetryService {
    
    private static final Logger logger = LoggerFactory.getLogger(RetryService.class);
    private final RetryRegistry retryRegistry;
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public RetryService() {
        RetryConfig config = RetryConfig.custom()
            .maxAttempts(3)
            .waitDuration(Duration.ofSeconds(1))
            .retryExceptions(Exception.class)
            .build();
            
        this.retryRegistry = RetryRegistry.of(config);
    }
    
    public <T> T executeWithRetry(String name, Supplier<T> supplier) {
        Retry retry = retryRegistry.retry(name);
        
        retry.getEventPublisher()
            .onRetry(event -> {
                logger.warn("Retry attempt {} for {}: {}", 
                    event.getNumberOfRetryAttempts(), name, event.getLastThrowable().getMessage());
                metrics.put(name + "_retries", 
                    metrics.getOrDefault(name + "_retries", 0L) + 1);
            });
            
        Supplier<T> decoratedSupplier = Retry.decorateSupplier(retry, supplier);
        
        try {
            T result = decoratedSupplier.get();
            metrics.put(name + "_successes", metrics.getOrDefault(name + "_successes", 0L) + 1);
            return result;
        } catch (Exception e) {
            metrics.put(name + "_failures", metrics.getOrDefault(name + "_failures", 0L) + 1);
            throw e;
        }
    }
    
    public Map<String, Object> getRetryStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>();
        
        retryRegistry.getAllRetries().forEach(retry -> {
            String name = retry.getName();
            stats.put(name + "_successful_calls", retry.getMetrics().getNumberOfSuccessfulCallsWithoutRetryAttempt());
            stats.put(name + "_failed_calls", retry.getMetrics().getNumberOfFailedCallsWithoutRetryAttempt());
        });
        
        stats.putAll(metrics);
        return stats;
    }
}