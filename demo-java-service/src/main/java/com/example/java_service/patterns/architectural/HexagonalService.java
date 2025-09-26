package com.example.java_service.patterns.architectural;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class HexagonalService {
    
    private final Map<String, Object> dataStore = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public void saveData(String key, Object value) {
        dataStore.put(key, value);
        metrics.put("data_saved", metrics.getOrDefault("data_saved", 0L) + 1);
    }
    
    public Object getData(String key) {
        metrics.put("data_retrieved", metrics.getOrDefault("data_retrieved", 0L) + 1);
        return dataStore.get(key);
    }
    
    public Map<String, Object> getStats() {
        return Map.of(
            "total_records", dataStore.size(),
            "data_saved", metrics.getOrDefault("data_saved", 0L),
            "data_retrieved", metrics.getOrDefault("data_retrieved", 0L)
        );
    }
}