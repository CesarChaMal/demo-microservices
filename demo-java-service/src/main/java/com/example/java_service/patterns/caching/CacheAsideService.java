package com.example.java_service.patterns.caching;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

@Service
public class CacheAsideService {
    
    private static final Logger logger = LoggerFactory.getLogger(CacheAsideService.class);
    private final Map<String, Object> cache = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    @SuppressWarnings("unchecked")
    public <T> T get(String key, Supplier<T> dataLoader) {
        // Check cache first
        T cachedValue = (T) cache.get(key);
        if (cachedValue != null) {
            metrics.put("cache_hits", metrics.getOrDefault("cache_hits", 0L) + 1);
            logger.debug("Cache hit for key: {}", key);
            return cachedValue;
        }
        
        // Cache miss - load from source
        metrics.put("cache_misses", metrics.getOrDefault("cache_misses", 0L) + 1);
        logger.debug("Cache miss for key: {}", key);
        
        T value = dataLoader.get();
        if (value != null) {
            cache.put(key, value);
            logger.debug("Cached value for key: {}", key);
        }
        
        return value;
    }
    
    public void put(String key, Object value) {
        cache.put(key, value);
        metrics.put("cache_puts", metrics.getOrDefault("cache_puts", 0L) + 1);
        logger.debug("Put value in cache for key: {}", key);
    }
    
    @CacheEvict(value = "processedData", key = "#key")
    public void evict(String key) {
        cache.remove(key);
        metrics.put("cache_evictions", metrics.getOrDefault("cache_evictions", 0L) + 1);
        logger.debug("Evicted cache entry for key: {}", key);
    }
    
    public void clear() {
        int size = cache.size();
        cache.clear();
        metrics.put("cache_clears", metrics.getOrDefault("cache_clears", 0L) + 1);
        logger.info("Cleared cache with {} entries", size);
    }
    
    @Cacheable(value = "processedData", key = "#key")
    public Object getCacheable(String key, Supplier<Object> dataLoader) {
        // This method uses Spring's caching annotations
        return dataLoader.get();
    }
    
    public Map<String, Object> getCacheStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        stats.put("cache_size", cache.size());
        
        long hits = metrics.getOrDefault("cache_hits", 0L);
        long misses = metrics.getOrDefault("cache_misses", 0L);
        long total = hits + misses;
        
        if (total > 0) {
            stats.put("hit_rate", (double) hits / total * 100);
            stats.put("miss_rate", (double) misses / total * 100);
        }
        
        return stats;
    }
}