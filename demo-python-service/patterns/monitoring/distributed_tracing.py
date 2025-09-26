import time
import uuid
import threading
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

@dataclass
class Span:
    span_id: str
    trace_id: str
    parent_span_id: Optional[str]
    span_name: str
    start_time: float
    end_time: Optional[float] = None
    duration: Optional[float] = None
    tags: Dict[str, Any] = field(default_factory=dict)
    logs: List[Dict[str, Any]] = field(default_factory=list)
    status: str = 'ACTIVE'

@dataclass
class Trace:
    trace_id: str
    parent_trace_id: Optional[str]
    operation_name: str
    start_time: float
    end_time: Optional[float] = None
    duration: Optional[float] = None
    spans: List[str] = field(default_factory=list)
    status: str = 'ACTIVE'

class DistributedTracingService:
    def __init__(self):
        self.traces: Dict[str, Trace] = {}
        self.spans: Dict[str, Span] = {}
        self.lock = threading.Lock()

    def start_trace(self, operation_name: str, parent_trace_id: Optional[str] = None) -> str:
        trace_id = str(uuid.uuid4())
        trace = Trace(
            trace_id=trace_id,
            parent_trace_id=parent_trace_id,
            operation_name=operation_name,
            start_time=time.time()
        )
        
        with self.lock:
            self.traces[trace_id] = trace
        
        return trace_id

    def start_span(self, trace_id: str, span_name: str, parent_span_id: Optional[str] = None) -> str:
        span_id = str(uuid.uuid4())
        span = Span(
            span_id=span_id,
            trace_id=trace_id,
            parent_span_id=parent_span_id,
            span_name=span_name,
            start_time=time.time()
        )
        
        with self.lock:
            self.spans[span_id] = span
            
            trace = self.traces.get(trace_id)
            if trace:
                trace.spans.append(span_id)
        
        return span_id

    def finish_span(self, span_id: str, status: str = 'SUCCESS'):
        with self.lock:
            span = self.spans.get(span_id)
            if span:
                span.end_time = time.time()
                span.duration = span.end_time - span.start_time
                span.status = status

    def finish_trace(self, trace_id: str, status: str = 'SUCCESS'):
        with self.lock:
            trace = self.traces.get(trace_id)
            if trace:
                trace.end_time = time.time()
                trace.duration = trace.end_time - trace.start_time
                trace.status = status

    def add_tag(self, span_id: str, key: str, value: Any):
        with self.lock:
            span = self.spans.get(span_id)
            if span:
                span.tags[key] = value

    def get_trace(self, trace_id: str) -> Optional[Trace]:
        return self.traces.get(trace_id)

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            active_traces = sum(1 for t in self.traces.values() if t.status == 'ACTIVE')
            return {
                'active_traces': active_traces,
                'total_traces': len(self.traces),
                'total_spans': len(self.spans)
            }