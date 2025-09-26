package com.example.java_service.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.Map;

@FeignClient(
    name = "node-service",
    fallback = NodeServiceClientFallback.class,
    configuration = FeignConfiguration.class
)
public interface NodeServiceClient {

    @PostMapping("/process")
    @CircuitBreaker(name = "node-service")
    @Retry(name = "node-service")
    Map<String, Object> process(@RequestBody Map<String, Object> request);

    @GetMapping("/info")
    Map<String, Object> getInfo();
}