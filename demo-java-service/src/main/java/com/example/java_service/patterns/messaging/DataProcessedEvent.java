package com.example.java_service.event;

public class DataProcessedEvent extends DomainEvent {
    private final String requestId;
    private final Integer originalValue;
    private final Integer processedValue;

    public DataProcessedEvent(String requestId, Integer originalValue, Integer processedValue) {
        super("DataProcessed");
        this.requestId = requestId;
        this.originalValue = originalValue;
        this.processedValue = processedValue;
    }

    public String getRequestId() { return requestId; }
    public Integer getOriginalValue() { return originalValue; }
    public Integer getProcessedValue() { return processedValue; }
}
