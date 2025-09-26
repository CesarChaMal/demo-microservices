package com.example.java_service.patterns.transaction;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

@Service
public class OutboxService {
    
    private static final Logger logger = LoggerFactory.getLogger(OutboxService.class);
    private final Map<String, OutboxEvent> outboxEvents = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    
    @PostConstruct
    public void startProcessor() {
        scheduler.scheduleAtFixedRate(this::processOutboxEvents, 1, 1, TimeUnit.SECONDS);
        logger.info("Outbox event processor started");
    }
    
    public String saveEvent(String aggregateId, String eventType, Map<String, Object> eventData) {
        String eventId = UUID.randomUUID().toString();
        OutboxEvent event = new OutboxEvent(eventId, aggregateId, eventType, eventData);
        
        outboxEvents.put(eventId, event);
        metrics.put("events_saved", metrics.getOrDefault("events_saved", 0L) + 1);
        
        logger.info("Saved outbox event: {} for aggregate: {}", eventId, aggregateId);
        return eventId;
    }
    
    private void processOutboxEvents() {
        List<String> eventIds = new ArrayList<>(outboxEvents.keySet());
        
        // Batch process events
        int processed = 0;
        for (String eventId : eventIds) {
            if (processed >= 10) break;
            
            OutboxEvent event = outboxEvents.get(eventId);
            if (event != null) {
                try {
                    publishEvent(event);
                    outboxEvents.remove(eventId);
                    metrics.put("events_published", metrics.getOrDefault("events_published", 0L) + 1);
                    processed++;
                } catch (Exception e) {
                    metrics.put("publish_failures", metrics.getOrDefault("publish_failures", 0L) + 1);
                    logger.error("Failed to publish event: {}: {}", event.eventId, e.getMessage());
                }
            }
        }
        
        if (processed > 0) {
            logger.debug("Processed {} outbox events", processed);
        }
    }
    
    private void publishEvent(OutboxEvent event) {
        // Simulate event publishing to message broker
        try {
            Thread.sleep(50); // Simulate network delay
            logger.info("Published event: {} of type: {} for aggregate: {}", 
                event.eventId, event.eventType, event.aggregateId);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Event publishing interrupted", e);
        }
    }
    
    public Map<String, Object> getOutboxStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        stats.put("pending_events", outboxEvents.size());
        
        long saved = metrics.getOrDefault("events_saved", 0L);
        long published = metrics.getOrDefault("events_published", 0L);
        long failures = metrics.getOrDefault("publish_failures", 0L);
        
        if (saved > 0) {
            stats.put("publish_rate", (double) published / saved * 100);
            stats.put("failure_rate", (double) failures / saved * 100);
        }
        
        return stats;
    }
    
    @PreDestroy
    public void shutdown() {
        // Process remaining events before shutdown
        while (!outboxEvents.isEmpty()) {
            processOutboxEvents();
        }
        
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(10, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }
        logger.info("Outbox service shutdown completed");
    }
    
    public static class OutboxEvent {
        public final String eventId;
        public final String aggregateId;
        public final String eventType;
        public final Map<String, Object> eventData;
        public final Instant createdAt;
        
        public OutboxEvent(String eventId, String aggregateId, String eventType, Map<String, Object> eventData) {
            this.eventId = eventId;
            this.aggregateId = aggregateId;
            this.eventType = eventType;
            this.eventData = new HashMap<>(eventData);
            this.createdAt = Instant.now();
        }
    }
}