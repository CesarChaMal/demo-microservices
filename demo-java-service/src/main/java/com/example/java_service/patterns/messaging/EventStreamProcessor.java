package com.example.java_service.streaming;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class EventStreamProcessor {
    
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final Map<String, AtomicLong> eventCounts = new ConcurrentHashMap<>();
    
    public EventStreamProcessor(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }
    
    @KafkaListener(topics = "input-events", groupId = "stream-processor")
    public void processInputStream(Map<String, Object> event) {
        String eventType = (String) event.get("type");
        eventCounts.computeIfAbsent(eventType, k -> new AtomicLong(0)).incrementAndGet();
        
        // Transform and enrich event
        Map<String, Object> enrichedEvent = Map.of(
            "originalEvent", event,
            "processedAt", System.currentTimeMillis(),
            "processor", "java-service",
            "eventCount", eventCounts.get(eventType).get()
        );
        
        // Send to output stream
        kafkaTemplate.send("processed-events", enrichedEvent);
    }
    
    public Map<String, Long> getEventCounts() {
        return eventCounts.entrySet().stream()
            .collect(java.util.stream.Collectors.toMap(
                Map.Entry::getKey,
                e -> e.getValue().get()
            ));
    }
    
    public void publishEvent(String type, Object data) {
        Map<String, Object> event = Map.of(
            "type", type,
            "data", data,
            "timestamp", System.currentTimeMillis(),
            "source", "java-service"
        );
        kafkaTemplate.send("input-events", event);
    }
}