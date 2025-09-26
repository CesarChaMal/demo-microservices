package com.example.java_service.patterns.integration;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.stereotype.Component;
import java.util.Map;

@FeignClient(name = "python-service", fallback = PythonServiceFallback.class)
public interface OpenFeignService {
    @PostMapping("/process")
    Map<String, Object> process(@RequestBody Map<String, Object> request);
}

@Component
class PythonServiceFallback implements OpenFeignService {
    @Override
    public Map<String, Object> process(Map<String, Object> request) {
        return Map.of("result", request.get("value"), "source", "fallback");
    }
}