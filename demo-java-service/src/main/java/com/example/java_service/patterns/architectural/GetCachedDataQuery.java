package com.example.java_service.cqrs;

public record GetCachedDataQuery(String key) implements Query<Object> {}
