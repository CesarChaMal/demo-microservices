package com.example.java_service.event;

import java.time.LocalDateTime;
import java.util.UUID;

public abstract class DomainEvent {
    private final String eventId;
    private final LocalDateTime occurredOn;
    private final String eventType;

    protected DomainEvent(String eventType) {
        this.eventId = UUID.randomUUID().toString();
        this.occurredOn = LocalDateTime.now();
        this.eventType = eventType;
    }

    public String getEventId() { return eventId; }
    public LocalDateTime getOccurredOn() { return occurredOn; }
    public String getEventType() { return eventType; }
}

// Event implementations
class DataProcessedEvent extends DomainEvent {
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

class ServiceCallEvent extends DomainEvent {
    private final String serviceName;
    private final String endpoint;
    private final boolean success;

    public ServiceCallEvent(String serviceName, String endpoint, boolean success) {
        super("ServiceCall");
        this.serviceName = serviceName;
        this.endpoint = endpoint;
        this.success = success;
    }

    public String getServiceName() { return serviceName; }
    public String getEndpoint() { return endpoint; }
    public boolean isSuccess() { return success; }
}