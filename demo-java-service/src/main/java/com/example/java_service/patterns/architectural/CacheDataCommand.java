package com.example.java_service.cqrs;

public record CacheDataCommand(String key, Object value) implements Command {}
