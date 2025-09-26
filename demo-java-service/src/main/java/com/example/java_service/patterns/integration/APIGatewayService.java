package com.example.java_service.patterns.integration;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class APIGatewayService {
    private final Map<String, String> routes = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public APIGatewayService() {
        routes.put("/api/java/**", "java-service");
        routes.put("/api/python/**", "python-service");
        routes.put("/api/node/**", "node-service");
    }
    
    public String routeRequest(String path) {
        metrics.put("requests_routed", metrics.getOrDefault("requests_routed", 0L) + 1);
        
        for (Map.Entry<String, String> route : routes.entrySet()) {
            if (path.matches(route.getKey().replace("**", ".*"))) {
                return route.getValue();
            }
        }
        
        return "default-service";
    }
    
    public Map<String, Object> getStats() {
        return Map.of(
            "total_routes", routes.size(),
            "requests_routed", metrics.getOrDefault("requests_routed", 0L)
        );
    }
}