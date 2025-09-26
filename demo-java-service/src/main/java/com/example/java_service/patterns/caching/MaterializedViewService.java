package com.example.java_service.patterns.caching;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.*;
import java.util.function.Supplier;

@Service
public class MaterializedViewService {
    
    private static final Logger logger = LoggerFactory.getLogger(MaterializedViewService.class);
    private final Map<String, ViewData> views = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> refreshTasks = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(3);
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    @PostConstruct
    public void init() {
        // Initialize sample views
        createView("user_stats", this::generateUserStats, 600); // 10 minutes
        createView("order_summary", this::generateOrderSummary, 300); // 5 minutes
        logger.info("Materialized view service initialized");
    }
    
    public void createView(String name, Supplier<Object> queryFunction, int refreshIntervalSeconds) {
        ViewData viewData = new ViewData(queryFunction);
        views.put(name, viewData);
        
        // Initial refresh
        refreshView(name);
        
        // Schedule periodic refresh
        ScheduledFuture<?> task = scheduler.scheduleAtFixedRate(
            () -> refreshView(name), 
            refreshIntervalSeconds, 
            refreshIntervalSeconds, 
            TimeUnit.SECONDS
        );
        refreshTasks.put(name, task);
        
        logger.info("Created materialized view: {} with refresh interval: {}s", name, refreshIntervalSeconds);
    }
    
    public Object getView(String name) {
        ViewData viewData = views.get(name);
        if (viewData == null) {
            throw new IllegalArgumentException("View " + name + " not found");
        }
        
        metrics.put("view_hits", metrics.getOrDefault("view_hits", 0L) + 1);
        return viewData.data;
    }
    
    private void refreshView(String name) {
        ViewData viewData = views.get(name);
        if (viewData == null) return;
        
        try {
            Object newData = viewData.queryFunction.get();
            viewData.data = newData;
            viewData.lastRefresh = Instant.now();
            metrics.put("view_refreshes", metrics.getOrDefault("view_refreshes", 0L) + 1);
            logger.info("Refreshed materialized view: {}", name);
        } catch (Exception e) {
            metrics.put("refresh_errors", metrics.getOrDefault("refresh_errors", 0L) + 1);
            logger.error("Failed to refresh view {}: {}", name, e.getMessage());
        }
    }
    
    public void forceRefresh(String name) {
        if (views.containsKey(name)) {
            refreshView(name);
        }
    }
    
    public void deleteView(String name) {
        views.remove(name);
        ScheduledFuture<?> task = refreshTasks.remove(name);
        if (task != null) {
            task.cancel(false);
        }
        logger.info("Deleted materialized view: {}", name);
    }
    
    private Object generateUserStats() {
        return Map.of(
            "total_users", 1000,
            "active_users", 750,
            "last_updated", Instant.now()
        );
    }
    
    private Object generateOrderSummary() {
        return Map.of(
            "total_orders", 500,
            "pending_orders", 25,
            "last_updated", Instant.now()
        );
    }
    
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        stats.put("total_views", views.size());
        
        Map<String, Object> viewInfo = new ConcurrentHashMap<>();
        views.forEach((name, viewData) -> {
            viewInfo.put(name, Map.of(
                "last_refresh", viewData.lastRefresh,
                "has_data", viewData.data != null
            ));
        });
        stats.put("views", viewInfo);
        
        return stats;
    }
    
    @PreDestroy
    public void shutdown() {
        refreshTasks.values().forEach(task -> task.cancel(false));
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(10, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }
        logger.info("Materialized view service shutdown completed");
    }
    
    private static class ViewData {
        Object data;
        Instant lastRefresh;
        final Supplier<Object> queryFunction;
        
        ViewData(Supplier<Object> queryFunction) {
            this.queryFunction = queryFunction;
            this.lastRefresh = Instant.now();
        }
    }
}