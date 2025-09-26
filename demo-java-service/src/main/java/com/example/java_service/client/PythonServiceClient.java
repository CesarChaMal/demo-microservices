package com.example.java_service.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.Map;

@FeignClient(
    name = "python-service",
    fallback = PythonServiceClientFallback.class,
    configuration = FeignConfiguration.class
)
public interface PythonServiceClient {

    @PostMapping("/process")
    @CircuitBreaker(name = "python-service")
    @Retry(name = "python-service")
    Map<String, Object> process(@RequestBody Map<String, Object> request);
}