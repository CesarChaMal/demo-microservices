package com.example.java_service.cqrs;

import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

@Service
public class CommandHandler {

    private final CacheManager cacheManager;

    public CommandHandler(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    public void handle(ProcessDataCommand command) {
        // Process and store data
        var cache = cacheManager.getCache("processedData");
        if (cache != null) {
            cache.put(command.requestId(), command.value() * 2);
        }
    }

    public void handle(CacheDataCommand command) {
        var cache = cacheManager.getCache("cachedData");
        if (cache != null) {
            cache.put(command.key(), command.value());
        }
    }
}