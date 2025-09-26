package com.example.java_service.cqrs;

public interface Query<T> {
}

// Query implementations
record GetProcessedDataQuery(String requestId) implements Query<Object> {}

record GetCachedDataQuery(String key) implements Query<Object> {}

record GetServiceStatsQuery() implements Query<Object> {}