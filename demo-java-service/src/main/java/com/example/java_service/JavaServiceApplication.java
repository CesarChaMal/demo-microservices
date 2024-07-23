package com.example.javaservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@SpringBootApplication
@RestController
public class JavaServiceApplication {

    private final DiscoveryClient discoveryClient;

    public JavaServiceApplication(DiscoveryClient discoveryClient) {
        this.discoveryClient = discoveryClient;
    }

    public static void main(String[] args) {
        SpringApplication.run(JavaServiceApplication.class, args);
    }

    @PostMapping("/calculate")
    public Map<String, Object> calculate(@RequestBody Map<String, Integer> payload) {
        List<ServiceInstance> instances = discoveryClient.getInstances("python-service");
        if (instances == null || instances.isEmpty()) {
            throw new IllegalStateException("Python service not available");
        }
        ServiceInstance serviceInstance = instances.get(0);
        String pythonServiceUrl = serviceInstance.getUri().toString() + "/process";

        RestTemplate restTemplate = new RestTemplate();
        return restTemplate.postForObject(pythonServiceUrl, payload, Map.class);
    }
}
