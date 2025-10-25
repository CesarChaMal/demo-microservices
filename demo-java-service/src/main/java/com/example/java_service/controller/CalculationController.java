package com.example.java_service.controller;

import com.example.java_service.dto.ValueRequest;
import com.example.java_service.service.ExternalServiceClient;
import com.example.java_service.patterns.resilience.CircuitBreakerService;
import com.example.java_service.patterns.caching.CacheAsideService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@RestController
@Tag(name = "Java Service API", description = "Comprehensive microservices patterns implementation")
public class CalculationController {

    private final ExternalServiceClient externalServiceClient;
    
    @Autowired
    private CircuitBreakerService circuitBreakerService;
    
    @Autowired
    private CacheAsideService cacheAsideService;

    public CalculationController(ExternalServiceClient externalServiceClient) {
        this.externalServiceClient = externalServiceClient;
    }

    @Operation(summary = "Calculate via Python service with Circuit Breaker")
    @PostMapping("/calculate")
    public Map<String, Object> calculate(@RequestBody ValueRequest request) {
        if (request == null || request.getValue() == null) {
            throw new IllegalArgumentException("Request and value are required");
        }
        return externalServiceClient.callPythonService(request.getValue());
    }

    @Operation(summary = "Compute via Node service with Async + Circuit Breaker")
    @PostMapping("/compute")
    public CompletableFuture<Map<String, Object>> compute(@RequestBody ValueRequest request) {
        if (request == null || request.getValue() == null) {
            throw new IllegalArgumentException("Request and value are required");
        }
        return externalServiceClient.callNodeServiceAsync(request.getValue());
    }

    @Operation(summary = "Process data with comprehensive patterns")
    @PostMapping("/process")
    public Map<String, Object> process(@RequestBody ValueRequest request) {
        if (request == null || request.getValue() == null) {
            throw new IllegalArgumentException("Request and value are required");
        }
        
        String cacheKey = "processed:" + request.getValue();
        
        return cacheAsideService.get(cacheKey, () -> {
            return circuitBreakerService.executeWithCircuitBreaker("local-processing", () -> {
                return Map.of(
                    "result", request.getValue() * 2, 
                    "source", "java-service",
                    "timestamp", Instant.now(),
                    "patterns", java.util.List.of("circuit-breaker", "cache-aside")
                );
            });
        });
    }

    @Operation(summary = "Service information with patterns")
    @GetMapping("/info")
    public Map<String, Object> info() {
        return Map.of(
            "app", "java-service",
            "status", "running",
            "version", "2.0.0",
            "timestamp", Instant.now(),
            "patterns", java.util.List.of(
                "circuit-breaker", "retry", "bulkhead", "timeout",
                "cache-aside", "write-behind", "materialized-view",
                "saga", "outbox", "two-phase-commit"
            )
        );
    }
}
