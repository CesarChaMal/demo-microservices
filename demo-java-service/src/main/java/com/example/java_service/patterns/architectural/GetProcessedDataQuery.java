package com.example.java_service.cqrs;

public record GetProcessedDataQuery(String requestId) implements Query<Object> {}
