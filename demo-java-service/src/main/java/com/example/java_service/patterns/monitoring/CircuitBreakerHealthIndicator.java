package com.example.java_service.health;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.boot.actuator.health.Health;
import org.springframework.boot.actuator.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component
public class CircuitBreakerHealthIndicator implements HealthIndicator {

    private final CircuitBreakerRegistry circuitBreakerRegistry;

    public CircuitBreakerHealthIndicator(CircuitBreakerRegistry circuitBreakerRegistry) {
        this.circuitBreakerRegistry = circuitBreakerRegistry;
    }

    @Override
    public Health health() {
        Health.Builder builder = Health.up();
        
        circuitBreakerRegistry.getAllCircuitBreakers().forEach(circuitBreaker -> {
            String name = circuitBreaker.getName();
            CircuitBreaker.State state = circuitBreaker.getState();
            
            builder.withDetail(name + "-state", state.toString());
            builder.withDetail(name + "-failure-rate", 
                circuitBreaker.getMetrics().getFailureRate());
            
            if (state == CircuitBreaker.State.OPEN) {
                builder.down();
            }
        });
        
        return builder.build();
    }
}