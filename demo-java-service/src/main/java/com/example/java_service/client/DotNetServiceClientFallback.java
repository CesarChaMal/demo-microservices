package com.example.java_service.client;

import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class DotNetServiceClientFallback implements DotNetServiceClient {

    @Override
    public Map<String, Object> process(Map<String, Object> request) {
        return Map.of(
            "result", request.getOrDefault("value", 0),
            "source", "fallback-dotnet",
            "message", ".NET service unavailable"
        );
    }

    @Override
    public Map<String, Object> getInfo() {
        return Map.of(
            "app", "dotnet-service",
            "status", "unavailable",
            "source", "fallback"
        );
    }
}
