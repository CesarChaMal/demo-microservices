package com.example.java_service.patterns.integration;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class StranglerFigPattern {
    
    private final Map<String, Boolean> migrationRules = new ConcurrentHashMap<>();
    private final Map<String, Integer> migrationStats = new ConcurrentHashMap<>();
    
    public void addMigrationRule(String path, boolean useNewService) {
        migrationRules.put(path, useNewService);
        migrationStats.put(path, 0);
    }
    
    public Object routeRequest(String path, Object request) {
        boolean useNewService = migrationRules.getOrDefault(path, false);
        migrationStats.merge(path, 1, Integer::sum);
        
        if (useNewService) {
            return processWithNewService(request);
        } else {
            return processWithLegacyService(request);
        }
    }
    
    private Object processWithNewService(Object request) {
        return Map.of("result", "processed by new service", "version", "v2");
    }
    
    private Object processWithLegacyService(Object request) {
        return Map.of("result", "processed by legacy service", "version", "v1");
    }
    
    public Map<String, Object> getMigrationStats() {
        return Map.copyOf(migrationStats);
    }
}