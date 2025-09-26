package com.example.java_service.client;

import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class PythonServiceClientFallback implements PythonServiceClient {

    @Override
    public Map<String, Object> process(Map<String, Object> request) {
        return Map.of(
            "result", request.getOrDefault("value", 0),
            "source", "fallback-python",
            "message", "Python service unavailable"
        );
    }
}