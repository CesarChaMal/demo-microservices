package com.example.java_service.patterns.messaging;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class InboxPattern {
    
    private final Map<String, Object> processedMessages = new ConcurrentHashMap<>();
    private final AtomicInteger processedCount = new AtomicInteger(0);
    
    public boolean handleMessage(String messageId, Object eventData) {
        if (processedMessages.containsKey(messageId)) {
            return false; // Already processed
        }
        
        processedMessages.put(messageId, eventData);
        processedCount.incrementAndGet();
        return true;
    }
    
    public Map<String, Object> getStats() {
        return Map.of(
            "processed_count", processedCount.get(),
            "pending_count", 0
        );
    }
}