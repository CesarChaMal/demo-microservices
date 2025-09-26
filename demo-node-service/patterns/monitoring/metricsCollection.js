class MetricsCollector {
    constructor() {
        this.counters = new Map();
        this.gauges = new Map();
        this.histograms = new Map();
    }

    incrementCounter(name, labels = {}, value = 1) {
        const key = this.createKey(name, labels);
        this.counters.set(key, (this.counters.get(key) || 0) + value);
    }

    setGauge(name, labels = {}, value) {
        const key = this.createKey(name, labels);
        this.gauges.set(key, { value, timestamp: Date.now() });
    }

    recordHistogram(name, labels = {}, value) {
        const key = this.createKey(name, labels);
        if (!this.histograms.has(key)) {
            this.histograms.set(key, { count: 0, sum: 0, buckets: new Map() });
        }
        
        const hist = this.histograms.get(key);
        hist.count++;
        hist.sum += value;
        
        const buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
        buckets.forEach(bucket => {
            if (value <= bucket) {
                hist.buckets.set(bucket, (hist.buckets.get(bucket) || 0) + 1);
            }
        });
    }

    createKey(name, labels) {
        const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return labelStr ? `${name}{${labelStr}}` : name;
    }

    getMetrics() {
        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            histograms: Object.fromEntries(this.histograms)
        };
    }

    getPrometheusMetrics() {
        const lines = [];
        
        for (const [key, value] of this.counters) {
            lines.push(`${key} ${value}`);
        }
        
        for (const [key, data] of this.gauges) {
            lines.push(`${key} ${data.value}`);
        }
        
        for (const [key, data] of this.histograms) {
            lines.push(`${key}_count ${data.count}`);
            lines.push(`${key}_sum ${data.sum}`);
            for (const [bucket, count] of data.buckets) {
                lines.push(`${key}_bucket{le="${bucket}"} ${count}`);
            }
        }
        
        return lines.join('\n');
    }
}

module.exports = { MetricsCollector };