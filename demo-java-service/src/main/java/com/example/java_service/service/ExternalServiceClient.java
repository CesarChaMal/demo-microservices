package com.example.java_service.service;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import io.github.resilience4j.bulkhead.annotation.Bulkhead;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
public class ExternalServiceClient {

    private final DiscoveryClient discoveryClient;
    private final RestTemplate restTemplate;

    public ExternalServiceClient(DiscoveryClient discoveryClient, RestTemplate restTemplate) {
        this.discoveryClient = discoveryClient;
        this.restTemplate = restTemplate;
    }

    @CircuitBreaker(name = "python-service", fallbackMethod = "fallbackPythonService")
    @Retry(name = "python-service")
    @Bulkhead(name = "python-service")
    public Map<String, Object> callPythonService(Integer value) {
        String url = getServiceUrl("python-service") + "/process";
        return restTemplate.postForObject(url, Map.of("value", value), Map.class);
    }

    @CircuitBreaker(name = "node-service", fallbackMethod = "fallbackNodeService")
    @Retry(name = "node-service")
    @Bulkhead(name = "node-service")
    @TimeLimiter(name = "node-service")
    public CompletableFuture<Map<String, Object>> callNodeServiceAsync(Integer value) {
        return CompletableFuture.supplyAsync(() -> {
            String url = getServiceUrl("node-service") + "/process";
            return restTemplate.postForObject(url, Map.of("value", value), Map.class);
        });
    }

    private String getServiceUrl(String serviceName) {
        List<ServiceInstance> instances = discoveryClient.getInstances(serviceName);
        if (instances == null || instances.isEmpty()) {
            throw new IllegalStateException(serviceName + " not available");
        }
        return instances.get(0).getUri().toString();
    }

    // Fallback methods
    public Map<String, Object> fallbackPythonService(Integer value, Exception ex) {
        return Map.of("result", value, "source", "fallback", "error", ex.getMessage());
    }

    public CompletableFuture<Map<String, Object>> fallbackNodeService(Integer value, Exception ex) {
        return CompletableFuture.completedFuture(
            Map.of("result", value, "source", "fallback", "error", ex.getMessage())
        );
    }
}