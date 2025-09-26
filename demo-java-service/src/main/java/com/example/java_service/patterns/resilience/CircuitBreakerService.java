package com.example.java_service.patterns.resilience;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

@Service
public class CircuitBreakerService {
    
    private static final Logger logger = LoggerFactory.getLogger(CircuitBreakerService.class);
    private final CircuitBreakerRegistry circuitBreakerRegistry;
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public CircuitBreakerService() {
        CircuitBreakerConfig config = CircuitBreakerConfig.custom()
            .failureRateThreshold(50)
            .waitDurationInOpenState(Duration.ofSeconds(30))
            .slidingWindowSize(10)
            .minimumNumberOfCalls(5)
            .build();
            
        this.circuitBreakerRegistry = CircuitBreakerRegistry.of(config);
    }
    
    public <T> T executeWithCircuitBreaker(String name, Supplier<T> supplier) {
        CircuitBreaker circuitBreaker = circuitBreakerRegistry.circuitBreaker(name);
        
        circuitBreaker.getEventPublisher()
            .onStateTransition(event -> {
                logger.info("Circuit breaker {} transitioned from {} to {}", 
                    name, event.getStateTransition().getFromState(), 
                    event.getStateTransition().getToState());
                metrics.put(name + "_state_transitions", 
                    metrics.getOrDefault(name + "_state_transitions", 0L) + 1);
            });
            
        Supplier<T> decoratedSupplier = CircuitBreaker.decorateSupplier(circuitBreaker, supplier);
        
        try {
            T result = decoratedSupplier.get();
            metrics.put(name + "_successes", metrics.getOrDefault(name + "_successes", 0L) + 1);
            return result;
        } catch (Exception e) {
            metrics.put(name + "_failures", metrics.getOrDefault(name + "_failures", 0L) + 1);
            throw e;
        }
    }
    
    public Map<String, Object> getCircuitBreakerStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>();
        
        circuitBreakerRegistry.getAllCircuitBreakers().forEach(cb -> {
            String name = cb.getName();
            stats.put(name + "_state", cb.getState().toString());
            stats.put(name + "_failure_rate", cb.getMetrics().getFailureRate());
            stats.put(name + "_call_count", cb.getMetrics().getNumberOfBufferedCalls());
        });
        
        stats.putAll(metrics);
        return stats;
    }
}