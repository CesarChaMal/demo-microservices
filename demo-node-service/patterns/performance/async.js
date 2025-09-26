const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { EventEmitter } = require('events');

class AsyncProcessor {
    constructor(options = {}) {
        this.maxConcurrency = options.maxConcurrency || 10;
        this.queue = [];
        this.running = 0;
        this.results = new Map();
        this.eventEmitter = new EventEmitter();
    }
    
    async process(task, priority = 0) {
        return new Promise((resolve, reject) => {
            const taskId = require('uuid').v4();
            const taskWrapper = {
                id: taskId,
                task,
                priority,
                resolve,
                reject,
                createdAt: new Date()
            };
            
            this.queue.push(taskWrapper);
            this.queue.sort((a, b) => b.priority - a.priority);
            
            this.processNext();
        });
    }
    
    async processNext() {
        if (this.running >= this.maxConcurrency || this.queue.length === 0) {
            return;
        }
        
        const taskWrapper = this.queue.shift();
        this.running++;
        
        try {
            const startTime = Date.now();
            const result = await taskWrapper.task();
            const endTime = Date.now();
            
            this.results.set(taskWrapper.id, {
                result,
                duration: endTime - startTime,
                completedAt: new Date()
            });
            
            taskWrapper.resolve(result);
            this.eventEmitter.emit('taskCompleted', {
                id: taskWrapper.id,
                result,
                duration: endTime - startTime
            });
            
        } catch (error) {
            taskWrapper.reject(error);
            this.eventEmitter.emit('taskFailed', {
                id: taskWrapper.id,
                error: error.message
            });
        } finally {
            this.running--;
            this.processNext();
        }
    }
    
    getStats() {
        return {
            running: this.running,
            queued: this.queue.length,
            maxConcurrency: this.maxConcurrency,
            completed: this.results.size
        };
    }
    
    on(event, listener) {
        this.eventEmitter.on(event, listener);
    }
}

class WorkerPool {
    constructor(workerScript, options = {}) {
        this.workerScript = workerScript;
        this.poolSize = options.poolSize || 4;
        this.workers = [];
        this.availableWorkers = [];
        this.taskQueue = [];
        this.taskResults = new Map();
        
        this.initializeWorkers();
    }
    
    initializeWorkers() {
        for (let i = 0; i < this.poolSize; i++) {
            const worker = new Worker(this.workerScript);
            
            worker.on('message', (result) => {
                const { taskId, data, error } = result;
                const taskPromise = this.taskResults.get(taskId);
                
                if (taskPromise) {
                    if (error) {
                        taskPromise.reject(new Error(error));
                    } else {
                        taskPromise.resolve(data);
                    }
                    this.taskResults.delete(taskId);
                }
                
                this.availableWorkers.push(worker);
                this.processNextTask();
            });
            
            worker.on('error', (error) => {
                console.error('Worker error:', error);
            });
            
            this.workers.push(worker);
            this.availableWorkers.push(worker);
        }
    }
    
    async execute(data) {
        return new Promise((resolve, reject) => {
            const taskId = require('uuid').v4();
            const task = { taskId, data, resolve, reject };
            
            this.taskQueue.push(task);
            this.taskResults.set(taskId, { resolve, reject });
            
            this.processNextTask();
        });
    }
    
    processNextTask() {
        if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
            return;
        }
        
        const task = this.taskQueue.shift();
        const worker = this.availableWorkers.shift();
        
        worker.postMessage({
            taskId: task.taskId,
            data: task.data
        });
    }
    
    async terminate() {
        await Promise.all(this.workers.map(worker => worker.terminate()));
    }
    
    getStats() {
        return {
            poolSize: this.poolSize,
            availableWorkers: this.availableWorkers.length,
            queuedTasks: this.taskQueue.length,
            activeTasks: this.taskResults.size
        };
    }
}

class ReactiveStream {
    constructor() {
        this.subscribers = [];
        this.operators = [];
    }
    
    static of(...values) {
        const stream = new ReactiveStream();
        setTimeout(() => {
            values.forEach(value => stream.emit(value));
            stream.complete();
        }, 0);
        return stream;
    }
    
    static fromArray(array) {
        return ReactiveStream.of(...array);
    }
    
    static interval(ms) {
        const stream = new ReactiveStream();
        let count = 0;
        const intervalId = setInterval(() => {
            stream.emit(count++);
        }, ms);
        
        stream.onComplete(() => clearInterval(intervalId));
        return stream;
    }
    
    subscribe(observer) {
        if (typeof observer === 'function') {
            observer = { next: observer };
        }
        
        this.subscribers.push(observer);
        return {
            unsubscribe: () => {
                const index = this.subscribers.indexOf(observer);
                if (index > -1) {
                    this.subscribers.splice(index, 1);
                }
            }
        };
    }
    
    emit(value) {
        let processedValue = value;
        
        // Apply operators
        for (const operator of this.operators) {
            processedValue = operator(processedValue);
            if (processedValue === undefined) return; // Filtered out
        }
        
        // Notify subscribers
        this.subscribers.forEach(subscriber => {
            if (subscriber.next) {
                try {
                    subscriber.next(processedValue);
                } catch (error) {
                    if (subscriber.error) {
                        subscriber.error(error);
                    }
                }
            }
        });
    }
    
    error(err) {
        this.subscribers.forEach(subscriber => {
            if (subscriber.error) {
                subscriber.error(err);
            }
        });
    }
    
    complete() {
        this.subscribers.forEach(subscriber => {
            if (subscriber.complete) {
                subscriber.complete();
            }
        });
    }
    
    map(fn) {
        const newStream = new ReactiveStream();
        newStream.operators = [...this.operators, (value) => fn(value)];
        
        this.subscribe({
            next: (value) => newStream.emit(value),
            error: (err) => newStream.error(err),
            complete: () => newStream.complete()
        });
        
        return newStream;
    }
    
    filter(predicate) {
        const newStream = new ReactiveStream();
        newStream.operators = [...this.operators, (value) => predicate(value) ? value : undefined];
        
        this.subscribe({
            next: (value) => newStream.emit(value),
            error: (err) => newStream.error(err),
            complete: () => newStream.complete()
        });
        
        return newStream;
    }
    
    take(count) {
        const newStream = new ReactiveStream();
        let taken = 0;
        
        const subscription = this.subscribe({
            next: (value) => {
                if (taken < count) {
                    newStream.emit(value);
                    taken++;
                    if (taken === count) {
                        newStream.complete();
                        subscription.unsubscribe();
                    }
                }
            },
            error: (err) => newStream.error(err),
            complete: () => newStream.complete()
        });
        
        return newStream;
    }
    
    debounce(ms) {
        const newStream = new ReactiveStream();
        let timeoutId;
        
        this.subscribe({
            next: (value) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    newStream.emit(value);
                }, ms);
            },
            error: (err) => newStream.error(err),
            complete: () => newStream.complete()
        });
        
        return newStream;
    }
    
    onComplete(callback) {
        this.subscribe({ complete: callback });
    }
}

class BackpressureHandler {
    constructor(options = {}) {
        this.bufferSize = options.bufferSize || 1000;
        this.strategy = options.strategy || 'drop'; // 'drop', 'block', 'sample'
        this.buffer = [];
        this.processing = false;
        this.droppedCount = 0;
    }
    
    async handle(item, processor) {
        switch (this.strategy) {
            case 'drop':
                return this.handleWithDrop(item, processor);
            case 'block':
                return this.handleWithBlock(item, processor);
            case 'sample':
                return this.handleWithSample(item, processor);
            default:
                return this.handleWithDrop(item, processor);
        }
    }
    
    async handleWithDrop(item, processor) {
        if (this.buffer.length >= this.bufferSize) {
            this.droppedCount++;
            throw new Error('Buffer overflow - item dropped');
        }
        
        this.buffer.push(item);
        return this.processBuffer(processor);
    }
    
    async handleWithBlock(item, processor) {
        while (this.buffer.length >= this.bufferSize) {
            await this.sleep(10); // Wait for buffer to drain
        }
        
        this.buffer.push(item);
        return this.processBuffer(processor);
    }
    
    async handleWithSample(item, processor) {
        if (this.buffer.length >= this.bufferSize) {
            // Replace random item in buffer
            const randomIndex = Math.floor(Math.random() * this.bufferSize);
            this.buffer[randomIndex] = item;
        } else {
            this.buffer.push(item);
        }
        
        return this.processBuffer(processor);
    }
    
    async processBuffer(processor) {
        if (this.processing || this.buffer.length === 0) {
            return;
        }
        
        this.processing = true;
        
        try {
            while (this.buffer.length > 0) {
                const item = this.buffer.shift();
                await processor(item);
            }
        } finally {
            this.processing = false;
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getStats() {
        return {
            bufferSize: this.bufferSize,
            currentBuffer: this.buffer.length,
            strategy: this.strategy,
            droppedCount: this.droppedCount,
            processing: this.processing
        };
    }
}

// Example worker script content (would be in a separate file)
const workerScript = `
const { parentPort } = require('worker_threads');

parentPort.on('message', async ({ taskId, data }) => {
    try {
        // Simulate CPU-intensive work
        const result = await processData(data);
        parentPort.postMessage({ taskId, data: result });
    } catch (error) {
        parentPort.postMessage({ taskId, error: error.message });
    }
});

async function processData(data) {
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
        result: data.value * 2,
        processedBy: 'worker',
        timestamp: Date.now()
    };
}
`;

module.exports = { 
    AsyncProcessor, 
    WorkerPool, 
    ReactiveStream, 
    BackpressureHandler,
    workerScript 
};