package com.example.java_service.patterns.monitoring;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DistributedTracingService {
    private final Map<String, TraceInfo> traces = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public String startTrace(String operation) {
        String traceId = UUID.randomUUID().toString();
        TraceInfo trace = new TraceInfo(traceId, operation, System.currentTimeMillis());
        traces.put(traceId, trace);
        
        metrics.put("traces_started", metrics.getOrDefault("traces_started", 0L) + 1);
        return traceId;
    }
    
    public void addSpan(String traceId, String spanName, long duration) {
        TraceInfo trace = traces.get(traceId);
        if (trace != null) {
            trace.addSpan(spanName, duration);
        }
    }
    
    public void endTrace(String traceId) {
        TraceInfo trace = traces.get(traceId);
        if (trace != null) {
            trace.endTime = System.currentTimeMillis();
            metrics.put("traces_completed", metrics.getOrDefault("traces_completed", 0L) + 1);
        }
    }
    
    public TraceInfo getTrace(String traceId) {
        return traces.get(traceId);
    }
    
    public Map<String, Object> getTracingStats() {
        return Map.of(
            "active_traces", traces.size(),
            "traces_started", metrics.getOrDefault("traces_started", 0L),
            "traces_completed", metrics.getOrDefault("traces_completed", 0L)
        );
    }
    
    public static class TraceInfo {
        public final String traceId;
        public final String operation;
        public final long startTime;
        public long endTime;
        public final Map<String, Long> spans = new ConcurrentHashMap<>();
        
        public TraceInfo(String traceId, String operation, long startTime) {
            this.traceId = traceId;
            this.operation = operation;
            this.startTime = startTime;
        }
        
        public void addSpan(String spanName, long duration) {
            spans.put(spanName, duration);
        }
        
        public long getTotalDuration() {
            return endTime > 0 ? endTime - startTime : System.currentTimeMillis() - startTime;
        }
    }
}