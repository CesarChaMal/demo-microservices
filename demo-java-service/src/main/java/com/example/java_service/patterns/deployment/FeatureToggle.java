package com.example.java_service.toggle;

import org.togglz.core.Feature;
import org.togglz.core.annotation.EnabledByDefault;
import org.togglz.core.annotation.Label;

public enum FeatureToggle implements Feature {
    
    @EnabledByDefault
    @Label("Enable new calculation algorithm")
    NEW_CALCULATION_ALGORITHM,
    
    @Label("Enable async processing")
    ASYNC_PROCESSING,
    
    @Label("Enable distributed caching")
    DISTRIBUTED_CACHING,
    
    @Label("Enable canary deployment")
    CANARY_DEPLOYMENT,
    
    @EnabledByDefault
    @Label("Enable rate limiting")
    RATE_LIMITING
}