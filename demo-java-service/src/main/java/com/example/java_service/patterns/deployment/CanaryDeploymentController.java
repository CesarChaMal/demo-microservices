package com.example.java_service.deployment;

import com.example.java_service.toggle.FeatureToggle;
import org.springframework.web.bind.annotation.*;
import org.togglz.core.manager.FeatureManager;

import java.util.Map;
import java.util.Random;

@RestController
@RequestMapping("/api/canary")
public class CanaryDeploymentController {
    
    private final FeatureManager featureManager;
    private final Random random = new Random();
    
    public CanaryDeploymentController(FeatureManager featureManager) {
        this.featureManager = featureManager;
    }
    
    @PostMapping("/calculate")
    public Map<String, Object> calculate(@RequestBody Map<String, Integer> request) {
        Integer value = request.get("value");
        
        if (featureManager.isActive(FeatureToggle.CANARY_DEPLOYMENT)) {
            // Canary: 10% traffic gets new algorithm
            if (random.nextInt(100) < 10) {
                return Map.of(
                    "result", value * 3, // New algorithm
                    "version", "v2-canary",
                    "algorithm", "enhanced"
                );
            }
        }
        
        // Stable version
        return Map.of(
            "result", value * 2,
            "version", "v1-stable",
            "algorithm", "standard"
        );
    }
    
    @GetMapping("/traffic-split")
    public Map<String, Object> getTrafficSplit() {
        boolean canaryEnabled = featureManager.isActive(FeatureToggle.CANARY_DEPLOYMENT);
        return Map.of(
            "canaryEnabled", canaryEnabled,
            "canaryPercentage", canaryEnabled ? 10 : 0,
            "stablePercentage", canaryEnabled ? 90 : 100
        );
    }
    
    @PostMapping("/toggle-canary")
    public Map<String, Object> toggleCanary(@RequestBody Map<String, Boolean> request) {
        // In production, this would be controlled by external configuration
        return Map.of(
            "message", "Canary toggle updated",
            "canaryEnabled", request.get("enabled")
        );
    }
}