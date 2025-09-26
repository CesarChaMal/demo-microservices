package com.example.java_service.event;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
public class EventPublisher {

    private final ApplicationEventPublisher applicationEventPublisher;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public EventPublisher(ApplicationEventPublisher applicationEventPublisher, 
                         KafkaTemplate<String, Object> kafkaTemplate) {
        this.applicationEventPublisher = applicationEventPublisher;
        this.kafkaTemplate = kafkaTemplate;
    }

    public void publishLocal(DomainEvent event) {
        applicationEventPublisher.publishEvent(event);
    }

    public void publishExternal(DomainEvent event) {
        kafkaTemplate.send("domain-events", event.getEventId(), event);
    }

    public void publishBoth(DomainEvent event) {
        publishLocal(event);
        publishExternal(event);
    }
}