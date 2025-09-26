import time
import threading
from collections import defaultdict
from typing import Dict, Any, Optional

class MetricsCollector:
    def __init__(self):
        self.counters: Dict[str, int] = defaultdict(int)
        self.gauges: Dict[str, Dict[str, Any]] = {}
        self.histograms: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            'count': 0, 'sum': 0, 'buckets': defaultdict(int)
        })
        self.lock = threading.Lock()

    def increment_counter(self, name: str, labels: Optional[Dict[str, str]] = None, value: int = 1):
        key = self._create_key(name, labels)
        with self.lock:
            self.counters[key] += value

    def set_gauge(self, name: str, labels: Optional[Dict[str, str]] = None, value: float = 0):
        key = self._create_key(name, labels)
        with self.lock:
            self.gauges[key] = {'value': value, 'timestamp': time.time()}

    def record_histogram(self, name: str, labels: Optional[Dict[str, str]] = None, value: float = 0):
        key = self._create_key(name, labels)
        with self.lock:
            hist = self.histograms[key]
            hist['count'] += 1
            hist['sum'] += value

            buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
            for bucket in buckets:
                if value <= bucket:
                    hist['buckets'][bucket] += 1

    def _create_key(self, name: str, labels: Optional[Dict[str, str]] = None) -> str:
        if not labels:
            return name
        label_str = ','.join(f'{k}="{v}"' for k, v in sorted(labels.items()))
        return f'{name}{{{label_str}}}'

    def get_metrics(self) -> Dict[str, Any]:
        with self.lock:
            return {
                'counters': dict(self.counters),
                'gauges': dict(self.gauges),
                'histograms': dict(self.histograms)
            }

    def get_prometheus_metrics(self) -> str:
        lines = []
        
        with self.lock:
            for key, value in self.counters.items():
                lines.append(f'{key} {value}')
            
            for key, data in self.gauges.items():
                lines.append(f'{key} {data["value"]}')
            
            for key, data in self.histograms.items():
                lines.append(f'{key}_count {data["count"]}')
                lines.append(f'{key}_sum {data["sum"]}')
                for bucket, count in data['buckets'].items():
                    lines.append(f'{key}_bucket{{le="{bucket}"}} {count}')
        
        return '\n'.join(lines)