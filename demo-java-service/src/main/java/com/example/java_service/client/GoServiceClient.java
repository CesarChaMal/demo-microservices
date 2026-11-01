package com.example.java_service.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.Map;

@FeignClient(
    name = "go-service",
    fallback = GoServiceClientFallback.class,
    configuration = FeignConfiguration.class
)
public interface GoServiceClient {

    @PostMapping("/process")
    @CircuitBreaker(name = "go-service")
    @Retry(name = "go-service")
    Map<String, Object> process(@RequestBody Map<String, Object> request);

    @GetMapping("/info")
    Map<String, Object> getInfo();
}
