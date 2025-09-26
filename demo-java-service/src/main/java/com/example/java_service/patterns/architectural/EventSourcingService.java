package com.example.java_service.patterns.architectural;

import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class EventSourcingService {
    
    private final Map<String, List<Event>> eventStore = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public void saveEvent(String aggregateId, String eventType, Map<String, Object> eventData) {
        Event event = new Event(UUID.randomUUID().toString(), aggregateId, eventType, eventData);
        eventStore.computeIfAbsent(aggregateId, k -> new ArrayList<>()).add(event);
        metrics.put("events_saved", metrics.getOrDefault("events_saved", 0L) + 1);
    }
    
    public List<Event> getEvents(String aggregateId) {
        return eventStore.getOrDefault(aggregateId, new ArrayList<>());
    }
    
    public Map<String, Object> getStats() {
        return Map.of(
            "total_aggregates", eventStore.size(),
            "events_saved", metrics.getOrDefault("events_saved", 0L)
        );
    }
    
    public static class Event {
        public final String eventId;
        public final String aggregateId;
        public final String eventType;
        public final Map<String, Object> eventData;
        public final Instant timestamp;
        
        public Event(String eventId, String aggregateId, String eventType, Map<String, Object> eventData) {
            this.eventId = eventId;
            this.aggregateId = aggregateId;
            this.eventType = eventType;
            this.eventData = new HashMap<>(eventData);
            this.timestamp = Instant.now();
        }
    }
}