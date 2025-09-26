package com.example.java_service.patterns.deployment;

import org.springframework.stereotype.Service;
import java.util.Map;

@Service
public class BlueGreenDeployment {
    
    private String activeEnvironment = "blue";
    private boolean switchInProgress = false;
    
    public String switchTraffic() {
        if (switchInProgress) {
            throw new IllegalStateException("Switch already in progress");
        }
        
        switchInProgress = true;
        String previousEnv = activeEnvironment;
        activeEnvironment = activeEnvironment.equals("blue") ? "green" : "blue";
        switchInProgress = false;
        
        return "Switched from " + previousEnv + " to " + activeEnvironment;
    }
    
    public Map<String, Object> getStatus() {
        return Map.of(
            "active_environment", activeEnvironment,
            "switch_in_progress", switchInProgress
        );
    }
}