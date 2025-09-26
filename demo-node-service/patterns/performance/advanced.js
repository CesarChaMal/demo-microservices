/**
 * Advanced Performance Patterns Implementation
 * Enhanced async processing, reactive streams, and performance optimization patterns.
 */

const EventEmitter = require('events');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { performance } = require('perf_hooks');

class AsyncTask {
    constructor(taskId, operation, priority = 0) {
        this.taskId = taskId;
        this.operation = operation;
        this.priority = priority;
        this.createdAt = Date.now();
        this.startedAt = null;
        this.completedAt = null;
        this.status = 'pending'; // pending, running, completed, failed
        this.result = null;
        this.error = null;
    }

    getDuration() {
        if (this.startedAt && this.completedAt) {
            return this.completedAt - this.startedAt;
        }
        return null;
    }
}

class AdvancedAsyncProcessor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.maxWorkers = options.maxWorkers || 4;
        this.maxQueueSize = options.maxQueueSize || 1000;
        this.taskQueue = [];
        this.runningTasks = new Map();
        this.completedTasks = new Map();
        this.workers = [];
        this.stats = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            activeTasks: 0,
            averageProcessingTime: 0
        };
        this.isProcessing = false;
    }

    async submitTask(operation, priority = 0) {
        if (this.taskQueue.length >= this.maxQueueSize) {
            throw new Error('Task queue is full');
        }

        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task = new AsyncTask(taskId, operation, priority);
        
        // Insert task in priority order
        this.insertTaskByPriority(task);
        this.stats.totalTasks++;
        
        this.emit('taskSubmitted', task);
        
        if (!this.isProcessing) {
            this.startProcessing();
        }
        
        return taskId;
    }

    insertTaskByPriority(task) {
        let inserted = false;
        for (let i = 0; i < this.taskQueue.length; i++) {
            if (task.priority > this.taskQueue[i].priority) {
                this.taskQueue.splice(i, 0, task);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this.taskQueue.push(task);
        }
    }

    async startProcessing() {
        this.isProcessing = true;
        
        while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
            // Start new tasks if we have capacity
            while (this.taskQueue.length > 0 && this.runningTasks.size < this.maxWorkers) {
                const task = this.taskQueue.shift();
                this.executeTask(task);
            }
            
            // Wait a bit before checking again
            await this.delay(10);
        }
        
        this.isProcessing = false;
    }

    async executeTask(task) {
        task.status = 'running';
        task.startedAt = Date.now();
        this.runningTasks.set(task.taskId, task);
        this.stats.activeTasks++;
        
        this.emit('taskStarted', task);
        
        try {
            task.result = await task.operation();
            task.status = 'completed';
            task.completedAt = Date.now();
            this.stats.completedTasks++;
            
            this.updateAverageProcessingTime(task.getDuration());
            this.emit('taskCompleted', task);
            
        } catch (error) {
            task.status = 'failed';
            task.error = error.message;
            task.completedAt = Date.now();
            this.stats.failedTasks++;
            
            this.emit('taskFailed', task, error);
        } finally {
            this.runningTasks.delete(task.taskId);
            this.completedTasks.set(task.taskId, task);
            this.stats.activeTasks--;
        }
    }

    updateAverageProcessingTime(duration) {
        const totalTime = this.stats.averageProcessingTime * (this.stats.completedTasks - 1) + duration;
        this.stats.averageProcessingTime = totalTime / this.stats.completedTasks;
    }

    getTaskStatus(taskId) {
        const runningTask = this.runningTasks.get(taskId);
        if (runningTask) return runningTask;
        
        const completedTask = this.completedTasks.get(taskId);
        if (completedTask) return completedTask;
        
        const queuedTask = this.taskQueue.find(task => task.taskId === taskId);
        return queuedTask || null;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStats() {
        return {
            ...this.stats,
            queueSize: this.taskQueue.length,
            maxQueueSize: this.maxQueueSize,
            maxWorkers: this.maxWorkers,
            successRate: this.stats.totalTasks > 0 ? 
                (this.stats.completedTasks / this.stats.totalTasks * 100) : 0
        };
    }
}

class EnhancedReactiveStream extends EventEmitter {
    constructor(source) {
        super();
        this.source = source;
        this.operators = [];
        this.isActive = false;
    }

    static fromArray(array) {
        return new EnhancedReactiveStream(async function* () {
            for (const item of array) {
                yield item;
            }
        });
    }

    static interval(ms, count = Infinity) {
        return new EnhancedReactiveStream(async function* () {
            let i = 0;
            while (i < count) {
                yield i++;
                await new Promise(resolve => setTimeout(resolve, ms));
            }
        });
    }

    static fromPromise(promise) {
        return new EnhancedReactiveStream(async function* () {
            try {
                const result = await promise;
                yield result;
            } catch (error) {
                throw error;
            }
        });
    }

    map(mapper) {
        const newStream = new EnhancedReactiveStream(async function* () {
            for await (const item of this.source()) {
                yield mapper(item);
            }
        }.bind(this));
        return newStream;
    }

    filter(predicate) {
        const newStream = new EnhancedReactiveStream(async function* () {
            for await (const item of this.source()) {
                if (predicate(item)) {
                    yield item;
                }
            }
        }.bind(this));
        return newStream;
    }

    take(count) {
        const newStream = new EnhancedReactiveStream(async function* () {
            let taken = 0;
            for await (const item of this.source()) {
                if (taken >= count) break;
                yield item;
                taken++;
            }
        }.bind(this));
        return newStream;
    }

    buffer(size) {
        const newStream = new EnhancedReactiveStream(async function* () {
            let buffer = [];
            for await (const item of this.source()) {
                buffer.push(item);
                if (buffer.length >= size) {
                    yield [...buffer];
                    buffer = [];
                }
            }
            if (buffer.length > 0) {
                yield buffer;
            }
        }.bind(this));
        return newStream;
    }

    debounce(ms) {
        const newStream = new EnhancedReactiveStream(async function* () {
            let lastItem = null;
            let timeoutId = null;
            
            for await (const item of this.source()) {
                lastItem = item;
                
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                await new Promise(resolve => {
                    timeoutId = setTimeout(() => {
                        resolve();
                    }, ms);
                });
                
                if (lastItem === item) {
                    yield item;
                }
            }
        }.bind(this));
        return newStream;
    }

    throttle(ms) {
        const newStream = new EnhancedReactiveStream(async function* () {
            let lastEmitTime = 0;
            
            for await (const item of this.source()) {
                const now = Date.now();
                if (now - lastEmitTime >= ms) {
                    yield item;
                    lastEmitTime = now;
                }
            }
        }.bind(this));
        return newStream;
    }

    async subscribe(observer) {
        this.isActive = true;
        
        try {
            for await (const item of this.source()) {
                if (!this.isActive) break;
                
                if (observer.next) {
                    observer.next(item);
                }
            }
            
            if (observer.complete && this.isActive) {
                observer.complete();
            }
        } catch (error) {
            if (observer.error) {
                observer.error(error);
            }
        }
    }

    unsubscribe() {
        this.isActive = false;
    }
}

class AdvancedBackpressureHandler extends EventEmitter {
    constructor(options = {}) {
        super();
        this.bufferSize = options.bufferSize || 1000;
        this.strategy = options.strategy || 'drop'; // drop, block, error, sample
        this.buffer = [];
        this.droppedCount = 0;
        this.blockedCount = 0;
        this.samplingRate = options.samplingRate || 0.1; // For sampling strategy
    }

    async handleItem(item) {
        switch (this.strategy) {
            case 'drop':
                return this.dropStrategy(item);
            case 'block':
                return await this.blockStrategy(item);
            case 'error':
                return this.errorStrategy(item);
            case 'sample':
                return this.sampleStrategy(item);
            default:
                return this.dropStrategy(item);
        }
    }

    dropStrategy(item) {
        if (this.buffer.length < this.bufferSize) {
            this.buffer.push(item);
            return true;
        } else {
            this.droppedCount++;
            this.emit('itemDropped', item);
            return false;
        }
    }

    async blockStrategy(item) {
        while (this.buffer.length >= this.bufferSize) {
            this.blockedCount++;
            await this.delay(10);
        }
        this.buffer.push(item);
        return true;
    }

    errorStrategy(item) {
        if (this.buffer.length >= this.bufferSize) {
            throw new Error('Buffer overflow - backpressure limit exceeded');
        }
        this.buffer.push(item);
        return true;
    }

    sampleStrategy(item) {
        if (this.buffer.length < this.bufferSize) {
            this.buffer.push(item);
            return true;
        } else {
            // Sample items based on sampling rate
            if (Math.random() < this.samplingRate) {
                // Replace random item in buffer
                const randomIndex = Math.floor(Math.random() * this.buffer.length);
                this.buffer[randomIndex] = item;
                return true;
            } else {
                this.droppedCount++;
                return false;
            }
        }
    }

    getItem() {
        return this.buffer.shift();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStats() {
        return {
            bufferSize: this.buffer.length,
            maxBufferSize: this.bufferSize,
            droppedCount: this.droppedCount,
            blockedCount: this.blockedCount,
            strategy: this.strategy,
            samplingRate: this.samplingRate
        };
    }
}

class WorkerThreadPool extends EventEmitter {
    constructor(options = {}) {
        super();
        this.maxWorkers = options.maxWorkers || 4;
        this.workers = [];
        this.taskQueue = [];
        this.activeWorkers = 0;
        this.stats = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            averageExecutionTime: 0
        };
    }

    async submitTask(taskFunction, data) {
        return new Promise((resolve, reject) => {
            const task = {
                id: `worker_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                function: taskFunction.toString(),
                data,
                resolve,
                reject,
                submittedAt: Date.now()
            };

            this.taskQueue.push(task);
            this.stats.totalTasks++;
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.taskQueue.length === 0 || this.activeWorkers >= this.maxWorkers) {
            return;
        }

        const task = this.taskQueue.shift();
        this.activeWorkers++;

        try {
            const worker = new Worker(__filename, {
                workerData: {
                    taskFunction: task.function,
                    taskData: task.data,
                    isWorkerTask: true
                }
            });

            worker.on('message', (result) => {
                const executionTime = Date.now() - task.submittedAt;
                this.updateAverageExecutionTime(executionTime);
                
                this.stats.completedTasks++;
                task.resolve(result);
                this.activeWorkers--;
                
                worker.terminate();
                this.processQueue();
            });

            worker.on('error', (error) => {
                this.stats.failedTasks++;
                task.reject(error);
                this.activeWorkers--;
                
                worker.terminate();
                this.processQueue();
            });

        } catch (error) {
            this.stats.failedTasks++;
            task.reject(error);
            this.activeWorkers--;
            this.processQueue();
        }
    }

    updateAverageExecutionTime(executionTime) {
        const totalTime = this.stats.averageExecutionTime * (this.stats.completedTasks - 1) + executionTime;
        this.stats.averageExecutionTime = totalTime / this.stats.completedTasks;
    }

    getStats() {
        return {
            ...this.stats,
            activeWorkers: this.activeWorkers,
            queuedTasks: this.taskQueue.length,
            maxWorkers: this.maxWorkers,
            successRate: this.stats.totalTasks > 0 ? 
                (this.stats.completedTasks / this.stats.totalTasks * 100) : 0
        };
    }

    async shutdown() {
        // Wait for all active workers to complete
        while (this.activeWorkers > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

// Worker thread execution
if (!isMainThread && workerData && workerData.isWorkerTask) {
    const { taskFunction, taskData } = workerData;
    
    try {
        // Safely execute the pre-defined function
        const allowedFunctions = {
            'cpuIntensive': (data) => {
                let result = data.value;
                for (let i = 0; i < 1000000; i++) {
                    result += Math.sqrt(i);
                }
                return { result: Math.floor(result), processedAt: Date.now() };
            }
        };
        
        const func = allowedFunctions[taskFunction] || allowedFunctions['cpuIntensive'];
        const result = func(taskData);
        
        if (result instanceof Promise) {
            result.then(res => parentPort.postMessage(res))
                  .catch(err => parentPort.postMessage({ error: err.message }));
        } else {
            parentPort.postMessage(result);
        }
    } catch (error) {
        parentPort.postMessage({ error: error.message });
    }
}

class PerformanceMonitor extends EventEmitter {
    constructor() {
        super();
        this.metrics = new Map();
        this.startTimes = new Map();
    }

    startTimer(operationName) {
        const timerId = `${operationName}_${Date.now()}_${Math.random()}`;
        this.startTimes.set(timerId, performance.now());
        return timerId;
    }

    endTimer(timerId, operationName) {
        const startTime = this.startTimes.get(timerId);
        if (!startTime) return;

        const duration = performance.now() - startTime;
        this.startTimes.delete(timerId);
        
        this.recordMetric(operationName, duration);
        return duration;
    }

    recordMetric(operationName, value, success = true) {
        if (!this.metrics.has(operationName)) {
            this.metrics.set(operationName, {
                count: 0,
                totalTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0,
                values: []
            });
        }

        const metric = this.metrics.get(operationName);
        metric.count++;
        metric.totalTime += value;
        metric.minTime = Math.min(metric.minTime, value);
        metric.maxTime = Math.max(metric.maxTime, value);
        
        if (!success) {
            metric.errors++;
        }

        // Keep last 100 values for percentile calculations
        metric.values.push(value);
        if (metric.values.length > 100) {
            metric.values.shift();
        }

        this.emit('metricRecorded', { operationName, value, success });
    }

    getStats() {
        const stats = {};
        
        for (const [operationName, metric] of this.metrics) {
            const sortedValues = [...metric.values].sort((a, b) => a - b);
            const p50 = this.percentile(sortedValues, 50);
            const p95 = this.percentile(sortedValues, 95);
            const p99 = this.percentile(sortedValues, 99);

            stats[operationName] = {
                count: metric.count,
                errors: metric.errors,
                avgTime: metric.totalTime / metric.count,
                minTime: metric.minTime === Infinity ? 0 : metric.minTime,
                maxTime: metric.maxTime,
                errorRate: (metric.errors / metric.count * 100),
                p50,
                p95,
                p99
            };
        }

        return stats;
    }

    percentile(sortedArray, percentile) {
        if (sortedArray.length === 0) return 0;
        
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    }

    reset() {
        this.metrics.clear();
        this.startTimes.clear();
    }
}

module.exports = {
    AdvancedAsyncProcessor,
    EnhancedReactiveStream,
    AdvancedBackpressureHandler,
    WorkerThreadPool,
    PerformanceMonitor,
    AsyncTask
};