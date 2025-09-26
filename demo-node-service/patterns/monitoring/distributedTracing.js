const { v4: uuidv4 } = require('uuid');

class DistributedTracingService {
    constructor() {
        this.traces = new Map();
        this.spans = new Map();
    }

    startTrace(operationName, parentTraceId = null) {
        const traceId = uuidv4();
        const trace = {
            traceId,
            parentTraceId,
            operationName,
            startTime: Date.now(),
            spans: [],
            status: 'ACTIVE'
        };
        
        this.traces.set(traceId, trace);
        return traceId;
    }

    startSpan(traceId, spanName, parentSpanId = null) {
        const spanId = uuidv4();
        const span = {
            spanId,
            traceId,
            parentSpanId,
            spanName,
            startTime: Date.now(),
            tags: {},
            logs: [],
            status: 'ACTIVE'
        };
        
        this.spans.set(spanId, span);
        
        const trace = this.traces.get(traceId);
        if (trace) {
            trace.spans.push(spanId);
        }
        
        return spanId;
    }

    finishSpan(spanId, status = 'SUCCESS') {
        const span = this.spans.get(spanId);
        if (span) {
            span.endTime = Date.now();
            span.duration = span.endTime - span.startTime;
            span.status = status;
        }
    }

    finishTrace(traceId, status = 'SUCCESS') {
        const trace = this.traces.get(traceId);
        if (trace) {
            trace.endTime = Date.now();
            trace.duration = trace.endTime - trace.startTime;
            trace.status = status;
        }
    }

    addTag(spanId, key, value) {
        const span = this.spans.get(spanId);
        if (span) {
            span.tags[key] = value;
        }
    }

    getTrace(traceId) {
        return this.traces.get(traceId);
    }

    getStats() {
        return {
            activeTraces: Array.from(this.traces.values()).filter(t => t.status === 'ACTIVE').length,
            totalTraces: this.traces.size,
            totalSpans: this.spans.size
        };
    }
}

module.exports = { DistributedTracingService };