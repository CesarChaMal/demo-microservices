package com.example.java_service.cqrs;

public record ProcessDataCommand(Integer value, String requestId) implements Command {}
