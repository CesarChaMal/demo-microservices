package com.example.java_service.messaging;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class MessageProducer {
    
    @Autowired
    private RabbitTemplate rabbitTemplate;
    
    private static final String EXCHANGE = "microservices.exchange";
    
    public void sendProcessingMessage(Map<String, Object> message) {
        rabbitTemplate.convertAndSend(EXCHANGE, "processing.queue", message);
    }
    
    public void sendNotification(Map<String, Object> notification) {
        rabbitTemplate.convertAndSend(EXCHANGE, "notification.queue", notification);
    }
    
    public void sendDelayedMessage(Map<String, Object> message, int delaySeconds) {
        rabbitTemplate.convertAndSend(EXCHANGE, "delayed.queue", message, msg -> {
            msg.getMessageProperties().setDelay(delaySeconds * 1000);
            return msg;
        });
    }
}