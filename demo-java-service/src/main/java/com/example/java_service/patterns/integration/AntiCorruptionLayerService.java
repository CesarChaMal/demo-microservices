package com.example.java_service.patterns.integration;

import org.springframework.stereotype.Service;
import java.util.Map;

@Service
public class AntiCorruptionLayerService {
    
    public ModernRequest translateFromLegacy(LegacyRequest legacyRequest) {
        return new ModernRequest(
            legacyRequest.getLegacyId(),
            convertLegacyValue(legacyRequest.getLegacyValue()),
            mapLegacyType(legacyRequest.getLegacyType())
        );
    }
    
    public LegacyResponse translateToLegacy(ModernResponse modernResponse) {
        return new LegacyResponse(
            modernResponse.getResult(),
            mapToLegacyStatus(modernResponse.getStatus())
        );
    }
    
    private Integer convertLegacyValue(String legacyValue) {
        return Integer.parseInt(legacyValue);
    }
    
    private String mapLegacyType(String legacyType) {
        return switch (legacyType) {
            case "CALC" -> "calculation";
            case "PROC" -> "processing";
            default -> "unknown";
        };
    }
    
    private String mapToLegacyStatus(String modernStatus) {
        return switch (modernStatus) {
            case "SUCCESS" -> "OK";
            case "FAILED" -> "ERROR";
            default -> "UNKNOWN";
        };
    }
    
    public static class LegacyRequest {
        private String legacyId;
        private String legacyValue;
        private String legacyType;
        
        public String getLegacyId() { return legacyId; }
        public String getLegacyValue() { return legacyValue; }
        public String getLegacyType() { return legacyType; }
    }
    
    public static class ModernRequest {
        private final String id;
        private final Integer value;
        private final String type;
        
        public ModernRequest(String id, Integer value, String type) {
            this.id = id;
            this.value = value;
            this.type = type;
        }
        
        public String getId() { return id; }
        public Integer getValue() { return value; }
        public String getType() { return type; }
    }
    
    public static class LegacyResponse {
        private final Integer result;
        private final String status;
        
        public LegacyResponse(Integer result, String status) {
            this.result = result;
            this.status = status;
        }
        
        public Integer getResult() { return result; }
        public String getStatus() { return status; }
    }
    
    public static class ModernResponse {
        private final Integer result;
        private final String status;
        
        public ModernResponse(Integer result, String status) {
            this.result = result;
            this.status = status;
        }
        
        public Integer getResult() { return result; }
        public String getStatus() { return status; }
    }
}