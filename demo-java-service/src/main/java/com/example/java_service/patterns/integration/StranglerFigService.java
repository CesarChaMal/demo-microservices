package com.example.java_service.patterns.integration;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class StranglerFigService {
    private final Map<String, Boolean> migrationFlags = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public StranglerFigService() {
        migrationFlags.put("legacy-calculation", false);
        migrationFlags.put("legacy-validation", true);
    }
    
    public Object processRequest(String operation, Object request) {
        boolean useNewSystem = migrationFlags.getOrDefault(operation, false);
        
        if (useNewSystem) {
            metrics.put("new_system_calls", metrics.getOrDefault("new_system_calls", 0L) + 1);
            return processWithNewSystem(operation, request);
        } else {
            metrics.put("legacy_system_calls", metrics.getOrDefault("legacy_system_calls", 0L) + 1);
            return processWithLegacySystem(operation, request);
        }
    }
    
    private Object processWithNewSystem(String operation, Object request) {
        return Map.of("result", "processed by new system", "operation", operation);
    }
    
    private Object processWithLegacySystem(String operation, Object request) {
        return Map.of("result", "processed by legacy system", "operation", operation);
    }
    
    public void enableMigration(String operation) {
        migrationFlags.put(operation, true);
    }
    
    public Map<String, Object> getStats() {
        return Map.of(
            "migration_flags", migrationFlags,
            "new_system_calls", metrics.getOrDefault("new_system_calls", 0L),
            "legacy_system_calls", metrics.getOrDefault("legacy_system_calls", 0L)
        );
    }
}