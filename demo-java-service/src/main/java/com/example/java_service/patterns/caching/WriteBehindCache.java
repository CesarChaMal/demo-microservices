package com.example.java_service.patterns.caching;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.*;

@Service
public class WriteBehindCache {
    
    private static final Logger logger = LoggerFactory.getLogger(WriteBehindCache.class);
    private final Map<String, Object> cache = new ConcurrentHashMap<>();
    private final Set<String> dirtyKeys = ConcurrentHashMap.newKeySet();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    private final int flushInterval = 5; // seconds
    private final int batchSize = 10;
    
    @PostConstruct
    public void init() {
        // Start background writer
        scheduler.scheduleAtFixedRate(this::flushDirtyData, 
            flushInterval, flushInterval, TimeUnit.SECONDS);
        logger.info("Write-behind cache initialized with flush interval: {}s", flushInterval);
    }
    
    public Object get(String key) {
        Object value = cache.get(key);
        if (value != null) {
            metrics.put("cache_hits", metrics.getOrDefault("cache_hits", 0L) + 1);
        } else {
            metrics.put("cache_misses", metrics.getOrDefault("cache_misses", 0L) + 1);
        }
        return value;
    }
    
    public void put(String key, Object value) {
        cache.put(key, value);
        dirtyKeys.add(key);
        metrics.put("cache_writes", metrics.getOrDefault("cache_writes", 0L) + 1);
        logger.debug("Cached key: {}, marked dirty", key);
    }
    
    private void flushDirtyData() {
        if (dirtyKeys.isEmpty()) {
            return;
        }
        
        Set<String> keysToFlush = dirtyKeys.stream()
            .limit(batchSize)
            .collect(ConcurrentHashMap::newKeySet, Set::add, Set::addAll);
            
        for (String key : keysToFlush) {
            Object value = cache.get(key);
            if (value != null) {
                writeToStorage(key, value);
                dirtyKeys.remove(key);
            }
        }
        
        if (!keysToFlush.isEmpty()) {
            metrics.put("flush_operations", metrics.getOrDefault("flush_operations", 0L) + 1);
            logger.info("Flushed {} keys to storage", keysToFlush.size());
        }
    }
    
    private void writeToStorage(String key, Object value) {
        // Simulate write to persistent storage
        try {
            Thread.sleep(10); // Simulate I/O delay
            logger.debug("Writing to storage: {} = {}", key, value);
            metrics.put("storage_writes", metrics.getOrDefault("storage_writes", 0L) + 1);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("Storage write interrupted for key: {}", key);
        }
    }
    
    public void forceFlush() {
        flushDirtyData();
        logger.info("Force flush completed");
    }
    
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        stats.put("cache_size", cache.size());
        stats.put("dirty_keys", dirtyKeys.size());
        return stats;
    }
    
    @PreDestroy
    public void shutdown() {
        forceFlush();
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(10, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }
        logger.info("Write-behind cache shutdown completed");
    }
}