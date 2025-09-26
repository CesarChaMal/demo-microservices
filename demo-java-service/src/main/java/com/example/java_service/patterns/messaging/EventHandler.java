package com.example.java_service.event;

import org.springframework.context.event.EventListener;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class EventHandler {

    @EventListener
    public void handleDataProcessed(DataProcessedEvent event) {
        // Handle local data processed event
        System.out.println("Data processed locally: " + event.getRequestId() + 
                          " -> " + event.getProcessedValue());
    }

    @EventListener
    public void handleServiceCall(ServiceCallEvent event) {
        // Handle service call event for monitoring
        System.out.println("Service call: " + event.getServiceName() + 
                          " -> " + (event.isSuccess() ? "SUCCESS" : "FAILED"));
    }

    @KafkaListener(topics = "domain-events", groupId = "java-service-group")
    public void handleExternalEvent(DomainEvent event) {
        // Handle external events from Kafka
        System.out.println("External event received: " + event.getEventType() + 
                          " at " + event.getOccurredOn());
    }
}