package com.example.java_service.patterns.transaction;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

@Service
public class SagaOrchestrator {
    
    private static final Logger logger = LoggerFactory.getLogger(SagaOrchestrator.class);
    private final Map<String, SagaInstance> sagas = new ConcurrentHashMap<>();
    private final Map<String, SagaDefinition> sagaDefinitions = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public SagaOrchestrator() {
        registerOrderProcessingSaga();
    }
    
    public String startSaga(String sagaType, Map<String, Object> context) {
        SagaDefinition definition = sagaDefinitions.get(sagaType);
        if (definition == null) {
            throw new IllegalArgumentException("Saga type not found: " + sagaType);
        }
        
        String sagaId = UUID.randomUUID().toString();
        SagaInstance instance = new SagaInstance(sagaId, sagaType, context, definition);
        sagas.put(sagaId, instance);
        
        metrics.put("sagas_started", metrics.getOrDefault("sagas_started", 0L) + 1);
        logger.info("Started saga: {} of type: {}", sagaId, sagaType);
        
        // Execute first step
        executeNextStep(sagaId);
        
        return sagaId;
    }
    
    public boolean executeStep(String sagaId, String stepName) {
        SagaInstance saga = sagas.get(sagaId);
        if (saga == null) {
            logger.warn("Saga not found: {}", sagaId);
            return false;
        }
        
        try {
            SagaStep step = saga.definition.getStep(stepName);
            if (step == null) {
                logger.error("Step not found: {} in saga: {}", stepName, sagaId);
                return false;
            }
            
            Object result = step.execute(saga.context);
            saga.completedSteps.add(stepName);
            saga.context.put(stepName + "_result", result);
            
            logger.info("Executed step: {} in saga: {}", stepName, sagaId);
            return true;
            
        } catch (Exception e) {
            logger.error("Step execution failed: {} in saga: {}: {}", stepName, sagaId, e.getMessage());
            compensateSaga(sagaId);
            return false;
        }
    }
    
    private void executeNextStep(String sagaId) {
        SagaInstance saga = sagas.get(sagaId);
        if (saga == null) return;
        
        List<String> steps = saga.definition.getStepNames();
        for (String stepName : steps) {
            if (!saga.completedSteps.contains(stepName)) {
                if (executeStep(sagaId, stepName)) {
                    if (saga.completedSteps.size() == steps.size()) {
                        completeSaga(sagaId);
                    }
                }
                break;
            }
        }
    }
    
    private void compensateSaga(String sagaId) {
        SagaInstance saga = sagas.get(sagaId);
        if (saga == null) return;
        
        saga.status = SagaStatus.COMPENSATING;
        
        // Execute compensation in reverse order
        List<String> completedSteps = new ArrayList<>(saga.completedSteps);
        Collections.reverse(completedSteps);
        
        for (String stepName : completedSteps) {
            try {
                SagaStep step = saga.definition.getStep(stepName);
                if (step != null && step.getCompensation() != null) {
                    step.getCompensation().apply(saga.context);
                    logger.info("Compensated step: {} in saga: {}", stepName, sagaId);
                }
            } catch (Exception e) {
                logger.error("Compensation failed for step: {} in saga: {}: {}", stepName, sagaId, e.getMessage());
            }
        }
        
        saga.status = SagaStatus.COMPENSATED;
        metrics.put("sagas_compensated", metrics.getOrDefault("sagas_compensated", 0L) + 1);
        logger.info("Saga compensated: {}", sagaId);
    }
    
    private void completeSaga(String sagaId) {
        SagaInstance saga = sagas.get(sagaId);
        if (saga == null) return;
        
        saga.status = SagaStatus.COMPLETED;
        saga.completedAt = Instant.now();
        metrics.put("sagas_completed", metrics.getOrDefault("sagas_completed", 0L) + 1);
        logger.info("Saga completed: {}", sagaId);
    }
    
    public SagaInstance getSagaStatus(String sagaId) {
        return sagas.get(sagaId);
    }
    
    private void registerOrderProcessingSaga() {
        SagaDefinition orderSaga = new SagaDefinition("order_processing");
        
        orderSaga.addStep("validate_order", 
            context -> {
                logger.info("Validating order: {}", context.get("order_id"));
                return Map.of("validated", true);
            },
            context -> logger.info("Compensating order validation"));
            
        orderSaga.addStep("reserve_inventory",
            context -> {
                logger.info("Reserving inventory for order: {}", context.get("order_id"));
                return Map.of("reserved", true, "reservation_id", UUID.randomUUID().toString());
            },
            context -> logger.info("Releasing inventory reservation"));
            
        orderSaga.addStep("process_payment",
            context -> {
                logger.info("Processing payment for order: {}", context.get("order_id"));
                return Map.of("payment_processed", true, "transaction_id", UUID.randomUUID().toString());
            },
            context -> logger.info("Refunding payment"));
            
        sagaDefinitions.put("order_processing", orderSaga);
    }
    
    public Map<String, Object> getSagaStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        stats.put("active_sagas", sagas.size());
        
        Map<SagaStatus, Long> statusCounts = new HashMap<>();
        sagas.values().forEach(saga -> 
            statusCounts.merge(saga.status, 1L, Long::sum));
        stats.put("status_counts", statusCounts);
        
        return stats;
    }
    
    public static class SagaInstance {
        public final String id;
        public final String type;
        public final Map<String, Object> context;
        public final SagaDefinition definition;
        public final Set<String> completedSteps = ConcurrentHashMap.newKeySet();
        public SagaStatus status = SagaStatus.RUNNING;
        public final Instant startedAt = Instant.now();
        public Instant completedAt;
        
        public SagaInstance(String id, String type, Map<String, Object> context, SagaDefinition definition) {
            this.id = id;
            this.type = type;
            this.context = new ConcurrentHashMap<>(context);
            this.definition = definition;
        }
    }
    
    public static class SagaDefinition {
        private final String name;
        private final Map<String, SagaStep> steps = new LinkedHashMap<>();
        
        public SagaDefinition(String name) {
            this.name = name;
        }
        
        public void addStep(String name, Function<Map<String, Object>, Object> action, 
                           Function<Map<String, Object>, Object> compensation) {
            steps.put(name, new SagaStep(name, action, compensation));
        }
        
        public SagaStep getStep(String name) {
            return steps.get(name);
        }
        
        public List<String> getStepNames() {
            return new ArrayList<>(steps.keySet());
        }
    }
    
    public static class SagaStep {
        private final String name;
        private final Function<Map<String, Object>, Object> action;
        private final Function<Map<String, Object>, Object> compensation;
        
        public SagaStep(String name, Function<Map<String, Object>, Object> action, 
                       Function<Map<String, Object>, Object> compensation) {
            this.name = name;
            this.action = action;
            this.compensation = compensation;
        }
        
        public Object execute(Map<String, Object> context) {
            return action.apply(context);
        }
        
        public Function<Map<String, Object>, Object> getCompensation() {
            return compensation;
        }
    }
    
    public enum SagaStatus {
        RUNNING, COMPLETED, COMPENSATING, COMPENSATED, FAILED
    }
}