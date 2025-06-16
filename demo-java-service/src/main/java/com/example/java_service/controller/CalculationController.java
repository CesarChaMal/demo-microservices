package com.example.java_service.controller;

import com.example.java_service.dto.ValueRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@RestController
@Tag(name = "Java Service API", description = "Endpoints for calculation and info")
public class CalculationController {

    private final DiscoveryClient discoveryClient;

    public CalculationController(DiscoveryClient discoveryClient) {
        this.discoveryClient = discoveryClient;
    }

    @Operation(summary = "Calculate via Python service")
    @PostMapping("/calculate")
    public Map<String, Object> calculate(@RequestBody ValueRequest request) {
        Integer value = request.getValue();

        List<ServiceInstance> instances = discoveryClient.getInstances("python-service");
        if (instances == null || instances.isEmpty()) {
            throw new IllegalStateException("Python service not available");
        }
        String url = instances.get(0).getUri().toString() + "/process";

        RestTemplate restTemplate = new RestTemplate();
        return restTemplate.postForObject(url, Map.of("value", value), Map.class);
    }

    @Operation(summary = "Compute via Node service")
    @PostMapping("/compute")
    public Map<String, Object> compute(@RequestBody ValueRequest request) {
        Integer value = request.getValue();

        List<ServiceInstance> instances = discoveryClient.getInstances("node-service");
        if (instances == null || instances.isEmpty()) {
            throw new IllegalStateException("Node service not available");
        }
        String url = instances.get(0).getUri().toString() + "/process";

        RestTemplate restTemplate = new RestTemplate();
        return restTemplate.postForObject(url, Map.of("value", value), Map.class);
    }

    @Operation(summary = "Service information")
    @GetMapping("/info")
    public Map<String, String> info() {
        return Map.of("app", "java-service", "status", "running");
    }
}
