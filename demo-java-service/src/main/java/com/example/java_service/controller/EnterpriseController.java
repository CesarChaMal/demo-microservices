package com.example.java_service.controller;

import com.example.java_service.client.NodeServiceClient;
import com.example.java_service.client.PythonServiceClient;
import com.example.java_service.cqrs.*;
import com.example.java_service.dto.ValueRequest;
import com.example.java_service.event.DataProcessedEvent;
import com.example.java_service.event.EventPublisher;
import com.example.java_service.event.ServiceCallEvent;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v2")
@Tag(name = "Enterprise Patterns API", description = "Advanced enterprise patterns implementation")
@Validated
public class EnterpriseController {

    private final PythonServiceClient pythonServiceClient;
    private final NodeServiceClient nodeServiceClient;
    private final CommandHandler commandHandler;
    private final QueryHandler queryHandler;
    private final EventPublisher eventPublisher;

    public EnterpriseController(PythonServiceClient pythonServiceClient,
                               NodeServiceClient nodeServiceClient,
                               CommandHandler commandHandler,
                               QueryHandler queryHandler,
                               EventPublisher eventPublisher) {
        this.pythonServiceClient = pythonServiceClient;
        this.nodeServiceClient = nodeServiceClient;
        this.commandHandler = commandHandler;
        this.queryHandler = queryHandler;
        this.eventPublisher = eventPublisher;
    }

    @Operation(summary = "Process data using OpenFeign with CQRS and Events")
    @PostMapping("/process-feign")
    public Map<String, Object> processWithFeign(@Valid @RequestBody ValueRequest request) {
        String requestId = UUID.randomUUID().toString();
        
        try {
            // Use OpenFeign client
            Map<String, Object> result = pythonServiceClient.process(Map.of("value", request.getValue()));
            
            // CQRS Command
            commandHandler.handle(new ProcessDataCommand(request.getValue(), requestId));
            
            // Publish Event
            eventPublisher.publishBoth(new DataProcessedEvent(
                requestId, request.getValue(), (Integer) result.get("result")
            ));
            
            // Publish Service Call Event
            eventPublisher.publishLocal(new ServiceCallEvent("python-service", "/process", true));
            
            return Map.of(
                "requestId", requestId,
                "result", result,
                "pattern", "OpenFeign + CQRS + Events"
            );
        } catch (Exception e) {
            eventPublisher.publishLocal(new ServiceCallEvent("python-service", "/process", false));
            throw e;
        }
    }

    @Operation(summary = "Get processed data using CQRS Query")
    @GetMapping("/processed/{requestId}")
    @Cacheable("processedData")
    public Map<String, Object> getProcessedData(@PathVariable String requestId) {
        Object data = queryHandler.handle(new GetProcessedDataQuery(requestId));
        return Map.of(
            "requestId", requestId,
            "data", data,
            "pattern", "CQRS Query + Caching"
        );
    }

    @Operation(summary = "Get service statistics using CQRS")
    @GetMapping("/stats")
    @Cacheable("serviceStats")
    public Map<String, Object> getServiceStats() {
        return (Map<String, Object>) queryHandler.handle(new GetServiceStatsQuery());
    }

    @Operation(summary = "Multi-service aggregation with OpenFeign")
    @PostMapping("/aggregate")
    public Map<String, Object> aggregateServices(@Valid @RequestBody ValueRequest request) {
        try {
            // Call multiple services using OpenFeign
            Map<String, Object> pythonResult = pythonServiceClient.process(Map.of("value", request.getValue()));
            Map<String, Object> nodeResult = nodeServiceClient.process(Map.of("value", request.getValue()));
            Map<String, Object> nodeInfo = nodeServiceClient.getInfo();
            
            return Map.of(
                "python", pythonResult,
                "node", nodeResult,
                "nodeInfo", nodeInfo,
                "pattern", "Service Aggregation with OpenFeign"
            );
        } catch (Exception e) {
            return Map.of(
                "error", e.getMessage(),
                "pattern", "Fallback Response"
            );
        }
    }

    @Operation(summary = "Cache management endpoint")
    @PostMapping("/cache")
    public Map<String, Object> manageCache(@RequestParam String key, @RequestBody Object value) {
        commandHandler.handle(new CacheDataCommand(key, value));
        return Map.of(
            "message", "Data cached successfully",
            "key", key,
            "pattern", "CQRS Command"
        );
    }

    @Operation(summary = "Get cached data")
    @GetMapping("/cache/{key}")
    public Map<String, Object> getCachedData(@PathVariable String key) {
        Object data = queryHandler.handle(new GetCachedDataQuery(key));
        return Map.of(
            "key", key,
            "data", data,
            "pattern", "CQRS Query"
        );
    }
}