package com.example.java_service.saga;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "saga_state")
public class SagaState {
    @Id
    private String sagaId;
    
    private String currentStep;
    
    @Enumerated(EnumType.STRING)
    private SagaStatus status;
    
    @ElementCollection
    @CollectionTable(name = "saga_context")
    private Map<String, String> context = new HashMap<>();
    
    @ElementCollection
    @CollectionTable(name = "saga_completed_steps")
    private List<String> completedSteps = new ArrayList<>();
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    public SagaState() {}
    
    public SagaState(String sagaId, String currentStep, SagaStatus status) {
        this.sagaId = sagaId;
        this.currentStep = currentStep;
        this.status = status;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
    
    // Getters and setters
    public String getSagaId() { return sagaId; }
    public void setSagaId(String sagaId) { this.sagaId = sagaId; }
    
    public String getCurrentStep() { return currentStep; }
    public void setCurrentStep(String currentStep) { 
        this.currentStep = currentStep;
        this.updatedAt = LocalDateTime.now();
    }
    
    public SagaStatus getStatus() { return status; }
    public void setStatus(SagaStatus status) { 
        this.status = status;
        this.updatedAt = LocalDateTime.now();
    }
    
    public Map<String, String> getContext() { return context; }
    public void setContext(Map<String, String> context) { this.context = context; }
    
    public List<String> getCompletedSteps() { return completedSteps; }
    public void setCompletedSteps(List<String> completedSteps) { this.completedSteps = completedSteps; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}

enum SagaStatus {
    STARTED, IN_PROGRESS, COMPLETED, FAILED, COMPENSATING, COMPENSATED
}