package com.example.java_service.controller;

import com.example.java_service.hexagonal.ProcessingPort;
import com.example.java_service.hexagonal.ProcessingRequest;
import com.example.java_service.messaging.MessageProducer;
import com.example.java_service.streaming.EventStreamProcessor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/mega")
public class MegaController {
    
    @Autowired
    private ProcessingPort processingService;
    
    @Autowired
    private MessageProducer messageProducer;
    
    @Autowired
    private EventStreamProcessor eventStreamProcessor;
    
    @PostMapping("/process-hexagonal")
    public Map<String, Object> processHexagonal(@RequestBody Map<String, Object> request) {
        Integer value = (Integer) request.get("value");
        String type = (String) request.getOrDefault("type", "double");
        
        var result = processingService.process(new ProcessingRequest(value, type));
        
        // Publish event
        eventStreamProcessor.publishEvent("PROCESSING_COMPLETED", result);
        
        return Map.of(
            "result", result.result(),
            "status", result.status(),
            "algorithm", result.algorithm(),
            "architecture", "hexagonal"
        );
    }
    
    @PostMapping("/process-async-messaging")
    public Mono<Map<String, Object>> processWithMessaging(@RequestBody Map<String, Object> request) {
        String requestId = UUID.randomUUID().toString();
        
        // Send to message queue
        messageProducer.sendProcessingMessage(Map.of(
            "requestId", requestId,
            "data", request,
            "timestamp", System.currentTimeMillis()
        ));
        
        return Mono.just(Map.of(
            "requestId", requestId,
            "status", "QUEUED",
            "message", "Request queued for async processing"
        ));
    }
    
    @GetMapping("/stream-stats")
    public Map<String, Object> getStreamStats() {
        return Map.of(
            "eventCounts", eventStreamProcessor.getEventCounts(),
            "streamingActive", true,
            "patterns", Map.of(
                "eventStreaming", "active",
                "messageQueue", "active",
                "hexagonal", "active",
                "reactive", "active"
            )
        );
    }
    
    @PostMapping("/publish-event")
    public Map<String, Object> publishEvent(@RequestBody Map<String, Object> request) {
        String eventType = (String) request.get("type");
        Object data = request.get("data");
        
        eventStreamProcessor.publishEvent(eventType, data);
        
        return Map.of(
            "published", true,
            "eventType", eventType,
            "timestamp", System.currentTimeMillis()
        );
    }
    
    @PostMapping("/delayed-notification")
    public Map<String, Object> sendDelayedNotification(@RequestBody Map<String, Object> request) {
        Integer delaySeconds = (Integer) request.getOrDefault("delay", 30);
        
        messageProducer.sendDelayedMessage(Map.of(
            "notification", request.get("message"),
            "recipient", request.get("recipient"),
            "scheduledFor", System.currentTimeMillis() + (delaySeconds * 1000L)
        ), delaySeconds);
        
        return Map.of(
            "scheduled", true,
            "delaySeconds", delaySeconds,
            "message", "Notification scheduled"
        );
    }
}