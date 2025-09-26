package com.example.java_service.patterns.resilience;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.*;
import java.util.function.Supplier;

@Service
public class BulkheadService {
    
    private static final Logger logger = LoggerFactory.getLogger(BulkheadService.class);
    private final Map<String, ExecutorService> executorPools = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public BulkheadService() {
        createPool("critical", 3);
        createPool("normal", 5);
        createPool("background", 2);
    }
    
    public void createPool(String name, int maxWorkers) {
        ExecutorService executor = Executors.newFixedThreadPool(maxWorkers, 
            r -> new Thread(r, "bulkhead-" + name + "-" + System.currentTimeMillis()));
        executorPools.put(name, executor);
        logger.info("Created bulkhead pool: {} with {} workers", name, maxWorkers);
    }
    
    public <T> CompletableFuture<T> executeInPool(String poolName, Supplier<T> supplier) {
        ExecutorService executor = executorPools.get(poolName);
        if (executor == null) {
            throw new IllegalArgumentException("Pool " + poolName + " not found");
        }
        
        metrics.put(poolName + "_executions", 
            metrics.getOrDefault(poolName + "_executions", 0L) + 1);
            
        return CompletableFuture.supplyAsync(() -> {
            try {
                T result = supplier.get();
                metrics.put(poolName + "_successes", 
                    metrics.getOrDefault(poolName + "_successes", 0L) + 1);
                return result;
            } catch (Exception e) {
                metrics.put(poolName + "_failures", 
                    metrics.getOrDefault(poolName + "_failures", 0L) + 1);
                logger.error("Bulkhead execution failed in pool {}: {}", poolName, e.getMessage());
                throw new RuntimeException(e);
            }
        }, executor);
    }
    
    public Map<String, Object> getBulkheadStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>();
        
        executorPools.forEach((name, executor) -> {
            if (executor instanceof ThreadPoolExecutor) {
                ThreadPoolExecutor tpe = (ThreadPoolExecutor) executor;
                stats.put(name + "_active_threads", tpe.getActiveCount());
                stats.put(name + "_completed_tasks", tpe.getCompletedTaskCount());
                stats.put(name + "_queue_size", tpe.getQueue().size());
            }
        });
        
        stats.putAll(metrics);
        return stats;
    }
    
    public void shutdown() {
        executorPools.values().forEach(ExecutorService::shutdown);
    }
}