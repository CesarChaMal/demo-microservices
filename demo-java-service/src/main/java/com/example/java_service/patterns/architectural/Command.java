package com.example.java_service.cqrs;

public interface Command {
}

// Command implementations
record ProcessDataCommand(Integer value, String requestId) implements Command {}

record CacheDataCommand(String key, Object value) implements Command {}