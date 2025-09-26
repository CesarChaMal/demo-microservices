package com.example.java_service.patterns.deployment;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class FeatureToggleService {
    
    private static final Logger logger = LoggerFactory.getLogger(FeatureToggleService.class);
    private final Map<String, FeatureFlag> features = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public FeatureToggleService() {
        initializeFeatures();
    }
    
    private void initializeFeatures() {
        features.put("new-algorithm", new FeatureFlag(true, 50));
        features.put("async-processing", new FeatureFlag(true, 100));
        features.put("canary-deployment", new FeatureFlag(true, 10));
        features.put("blue-green-deployment", new FeatureFlag(true, 100));
        features.put("cache-warming", new FeatureFlag(true, 100));
        features.put("circuit-breaker", new FeatureFlag(true, 100));
        features.put("saga-pattern", new FeatureFlag(true, 100));
        features.put("outbox-pattern", new FeatureFlag(true, 100));
        features.put("materialized-views", new FeatureFlag(true, 100));
        features.put("write-behind-cache", new FeatureFlag(true, 100));
        
        logger.info("Initialized {} feature flags", features.size());
    }
    
    public boolean isEnabled(String featureName) {
        return isEnabled(featureName, null);
    }
    
    public boolean isEnabled(String featureName, Map<String, Object> context) {
        FeatureFlag feature = features.get(featureName);
        if (feature == null) {
            metrics.put(featureName + "_not_found", 
                metrics.getOrDefault(featureName + "_not_found", 0L) + 1);
            return false;
        }
        
        if (!feature.enabled) {
            metrics.put(featureName + "_disabled", 
                metrics.getOrDefault(featureName + "_disabled", 0L) + 1);
            return false;
        }
        
        // Check rollout percentage
        if (feature.rolloutPercentage < 100 && context != null) {
            String userId = (String) context.get("userId");
            if (userId != null) {
                int hash = Math.abs(userId.hashCode()) % 100;
                boolean enabled = hash < feature.rolloutPercentage;
                
                String metricKey = featureName + (enabled ? "_enabled" : "_rollout_excluded");
                metrics.put(metricKey, metrics.getOrDefault(metricKey, 0L) + 1);
                
                return enabled;
            }
        }
        
        metrics.put(featureName + "_enabled", 
            metrics.getOrDefault(featureName + "_enabled", 0L) + 1);
        return true;
    }
    
    public void enableFeature(String featureName) {
        FeatureFlag feature = features.get(featureName);
        if (feature != null) {
            feature.enabled = true;
            logger.info("Enabled feature: {}", featureName);
        }
    }
    
    public void disableFeature(String featureName) {
        FeatureFlag feature = features.get(featureName);
        if (feature != null) {
            feature.enabled = false;
            logger.info("Disabled feature: {}", featureName);
        }
    }
    
    public void setRolloutPercentage(String featureName, int percentage) {
        FeatureFlag feature = features.get(featureName);
        if (feature != null) {
            feature.rolloutPercentage = Math.max(0, Math.min(100, percentage));
            logger.info("Set rollout percentage for {}: {}%", featureName, feature.rolloutPercentage);
        }
    }
    
    public Map<String, Object> getAllFeatures() {
        Map<String, Object> result = new ConcurrentHashMap<>();
        features.forEach((name, flag) -> {
            result.put(name, Map.of(
                "enabled", flag.enabled,
                "rolloutPercentage", flag.rolloutPercentage
            ));
        });
        return result;
    }
    
    public Map<String, Object> getFeatureStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        stats.put("total_features", features.size());
        
        long enabledCount = features.values().stream()
            .mapToLong(f -> f.enabled ? 1 : 0)
            .sum();
        stats.put("enabled_features", enabledCount);
        
        return stats;
    }
    
    private static class FeatureFlag {
        boolean enabled;
        int rolloutPercentage;
        
        FeatureFlag(boolean enabled, int rolloutPercentage) {
            this.enabled = enabled;
            this.rolloutPercentage = rolloutPercentage;
        }
    }
}