package com.example.java_service.patterns.integration;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class RepositoryService {
    
    private static final Logger logger = LoggerFactory.getLogger(RepositoryService.class);
    
    public interface Repository<T, ID> {
        T save(T entity);
        Optional<T> findById(ID id);
        List<T> findAll();
        void deleteById(ID id);
        boolean existsById(ID id);
    }
    
    public static class InMemoryRepository<T extends Entity<ID>, ID> implements Repository<T, ID> {
        private final Map<ID, T> storage = new ConcurrentHashMap<>();
        private final String entityName;
        
        public InMemoryRepository(String entityName) {
            this.entityName = entityName;
        }
        
        @Override
        public T save(T entity) {
            if (entity.getId() == null) {
                @SuppressWarnings("unchecked")
                ID newId = (ID) UUID.randomUUID().toString();
                entity.setId(newId);
            }
            entity.setUpdatedAt(Instant.now());
            storage.put(entity.getId(), entity);
            logger.debug("Saved {} with ID: {}", entityName, entity.getId());
            return entity;
        }
        
        @Override
        public Optional<T> findById(ID id) {
            T entity = storage.get(id);
            logger.debug("Finding {} by ID: {} - {}", entityName, id, entity != null ? "found" : "not found");
            return Optional.ofNullable(entity);
        }
        
        @Override
        public List<T> findAll() {
            List<T> entities = new ArrayList<>(storage.values());
            logger.debug("Finding all {}: {} entities", entityName, entities.size());
            return entities;
        }
        
        @Override
        public void deleteById(ID id) {
            T removed = storage.remove(id);
            logger.debug("Deleted {} with ID: {} - {}", entityName, id, removed != null ? "success" : "not found");
        }
        
        @Override
        public boolean existsById(ID id) {
            boolean exists = storage.containsKey(id);
            logger.debug("Checking existence of {} with ID: {} - {}", entityName, id, exists);
            return exists;
        }
        
        public List<T> findByField(String fieldName, Object value) {
            return storage.values().stream()
                .filter(entity -> {
                    try {
                        var field = entity.getClass().getDeclaredField(fieldName);
                        field.setAccessible(true);
                        Object fieldValue = field.get(entity);
                        return Objects.equals(fieldValue, value);
                    } catch (Exception e) {
                        return false;
                    }
                })
                .collect(Collectors.toList());
        }
        
        public Map<String, Object> getStats() {
            return Map.of(
                "entityName", entityName,
                "totalEntities", storage.size(),
                "lastUpdated", Instant.now()
            );
        }
    }
    
    public interface Entity<ID> {
        ID getId();
        void setId(ID id);
        Instant getCreatedAt();
        void setCreatedAt(Instant createdAt);
        Instant getUpdatedAt();
        void setUpdatedAt(Instant updatedAt);
    }
    
    public static class ProcessedData implements Entity<String> {
        private String id;
        private Integer value;
        private Integer result;
        private String algorithm;
        private Instant createdAt;
        private Instant updatedAt;
        
        public ProcessedData() {
            this.createdAt = Instant.now();
            this.updatedAt = Instant.now();
        }
        
        public ProcessedData(Integer value, Integer result, String algorithm) {
            this();
            this.value = value;
            this.result = result;
            this.algorithm = algorithm;
        }
        
        // Getters and setters
        @Override
        public String getId() { return id; }
        @Override
        public void setId(String id) { this.id = id; }
        public Integer getValue() { return value; }
        public void setValue(Integer value) { this.value = value; }
        public Integer getResult() { return result; }
        public void setResult(Integer result) { this.result = result; }
        public String getAlgorithm() { return algorithm; }
        public void setAlgorithm(String algorithm) { this.algorithm = algorithm; }
        @Override
        public Instant getCreatedAt() { return createdAt; }
        @Override
        public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
        @Override
        public Instant getUpdatedAt() { return updatedAt; }
        @Override
        public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    }
    
    // Repository instances
    private final InMemoryRepository<ProcessedData, String> processedDataRepository;
    
    public RepositoryService() {
        this.processedDataRepository = new InMemoryRepository<>("ProcessedData");
        initializeSampleData();
    }
    
    private void initializeSampleData() {
        processedDataRepository.save(new ProcessedData(10, 20, "double"));
        processedDataRepository.save(new ProcessedData(5, 15, "triple"));
        logger.info("Initialized repository with sample data");
    }
    
    public Repository<ProcessedData, String> getProcessedDataRepository() {
        return processedDataRepository;
    }
    
    public Map<String, Object> getAllRepositoryStats() {
        return Map.of(
            "processedData", processedDataRepository.getStats()
        );
    }
}