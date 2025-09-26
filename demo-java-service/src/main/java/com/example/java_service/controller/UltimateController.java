package com.example.java_service.controller;

import com.example.java_service.idempotency.IdempotencyService;
import com.example.java_service.materialized.MaterializedViewService;
import com.example.java_service.toggle.FeatureToggle;
import com.example.java_service.dto.ValueRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.togglz.core.manager.FeatureManager;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ultimate")
public class UltimateController {
    
    @Autowired
    private IdempotencyService idempotencyService;
    
    @Autowired
    private MaterializedViewService materializedViewService;
    
    @Autowired
    private FeatureManager featureManager;
    
    @PostMapping("/process-idempotent")
    public Map<String, Object> processIdempotent(
            @Valid @RequestBody ValueRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest httpRequest) {
        
        if (idempotencyKey == null) {
            idempotencyKey = idempotencyService.generateKey("process", request.getValue().toString());
        }
        
        try {
            Map<String, Object> result = idempotencyService.executeIdempotent(
                idempotencyKey,
                () -> {
                    // Simulate processing
                    int multiplier = featureManager.isActive(FeatureToggle.NEW_CALCULATION_ALGORITHM) ? 5 : 2;
                    return Map.of(
                        "result", request.getValue() * multiplier,
                        "idempotencyKey", idempotencyKey,
                        "algorithm", featureManager.isActive(FeatureToggle.NEW_CALCULATION_ALGORITHM) ? "v2" : "v1",
                        "processId", UUID.randomUUID().toString()
                    );
                },
                Map.class
            );
            
            materializedViewService.recordRequest(true);
            return result;
            
        } catch (Exception e) {
            materializedViewService.recordRequest(false);
            throw e;
        }
    }
    
    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        return Map.of(
            "currentStats", materializedViewService.getCurrentStats(),
            "featureToggles", Map.of(
                "newAlgorithm", featureManager.isActive(FeatureToggle.NEW_CALCULATION_ALGORITHM),
                "asyncProcessing", featureManager.isActive(FeatureToggle.ASYNC_PROCESSING),
                "distributedCaching", featureManager.isActive(FeatureToggle.DISTRIBUTED_CACHING),
                "rateLimiting", featureManager.isActive(FeatureToggle.RATE_LIMITING)
            )
        );
    }
    
    @GetMapping("/hourly-stats/{hour}")
    public Map<Object, Object> getHourlyStats(@PathVariable int hour) {
        return materializedViewService.getHourlyStats(hour);
    }
    
    @PostMapping("/compensate")
    public Map<String, Object> compensate(@RequestBody Map<String, String> request) {
        String transactionId = request.get("transactionId");
        
        // Simulate compensation logic
        return Map.of(
            "compensated", true,
            "transactionId", transactionId,
            "compensationId", UUID.randomUUID().toString(),
            "status", "COMPENSATED"
        );
    }
    
    @GetMapping("/health-detailed")
    public Map<String, Object> getDetailedHealth() {
        return Map.of(
            "status", "UP",
            "patterns", Map.of(
                "idempotency", "active",
                "materializedView", "active",
                "featureToggle", "active",
                "compensation", "active"
            ),
            "metrics", materializedViewService.getCurrentStats()
        );
    }
}