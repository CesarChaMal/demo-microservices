package com.example.java_service.patterns.transaction;

import javax.persistence.*;
import java.time.Instant;
import java.util.Map;

@Entity
@Table(name = "outbox_events")
public class OutboxEvent {
    
    @Id
    private String eventId;
    
    @Column(nullable = false)
    private String aggregateId;
    
    @Column(nullable = false)
    private String eventType;
    
    @Lob
    private String eventData;
    
    @Column(nullable = false)
    private Instant createdAt;
    
    @Column(nullable = false)
    private boolean processed = false;
    
    private Instant processedAt;
    
    public OutboxEvent() {}
    
    public OutboxEvent(String eventId, String aggregateId, String eventType, String eventData) {
        this.eventId = eventId;
        this.aggregateId = aggregateId;
        this.eventType = eventType;
        this.eventData = eventData;
        this.createdAt = Instant.now();
    }
    
    // Getters and setters
    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }
    
    public String getAggregateId() { return aggregateId; }
    public void setAggregateId(String aggregateId) { this.aggregateId = aggregateId; }
    
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    
    public String getEventData() { return eventData; }
    public void setEventData(String eventData) { this.eventData = eventData; }
    
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    
    public boolean isProcessed() { return processed; }
    public void setProcessed(boolean processed) { this.processed = processed; }
    
    public Instant getProcessedAt() { return processedAt; }
    public void setProcessedAt(Instant processedAt) { this.processedAt = processedAt; }
}