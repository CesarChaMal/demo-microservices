const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

class DistributedLock {
    constructor(options = {}) {
        this.client = redis.createClient({
            host: options.host || 'localhost',
            port: options.port || 6379
        });
        this.connected = false;
        this.connect();
    }
    
    async connect() {
        try {
            await this.client.connect();
            this.connected = true;
            console.log('Redis connected for distributed lock');
        } catch (error) {
            console.error('Redis connection failed:', error);
            this.connected = false;
        }
    }
    
    async acquireLock(lockKey, expiration = 30000) {
        if (!this.connected) return null;
        
        const lockValue = uuidv4();
        const expirationSeconds = Math.ceil(expiration / 1000);
        
        try {
            const result = await this.client.set(lockKey, lockValue, {
                PX: expiration,
                NX: true
            });
            
            return result === 'OK' ? lockValue : null;
        } catch (error) {
            console.error('Failed to acquire lock:', error);
            return null;
        }
    }
    
    async releaseLock(lockKey, lockValue) {
        if (!this.connected) return false;
        
        const script = `
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end
        `;
        
        try {
            const result = await this.client.eval(script, {
                keys: [lockKey],
                arguments: [lockValue]
            });
            return result === 1;
        } catch (error) {
            console.error('Failed to release lock:', error);
            return false;
        }
    }
    
    async executeWithLock(lockKey, expiration, callback) {
        const lockValue = await this.acquireLock(lockKey, expiration);
        if (!lockValue) {
            throw new Error(`Failed to acquire lock: ${lockKey}`);
        }
        
        try {
            return await callback();
        } finally {
            await this.releaseLock(lockKey, lockValue);
        }
    }
}

class IdempotencyService {
    constructor(options = {}) {
        this.cache = new Map();
        this.defaultTTL = options.defaultTTL || 24 * 60 * 60 * 1000; // 24 hours
        this.redis = options.redis;
    }
    
    generateKey(operation, ...params) {
        const crypto = require('crypto');
        const data = `${operation}:${params.join(':')}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    
    async executeIdempotent(idempotencyKey, operation) {
        if (this.redis && this.redis.connected) {
            return await this.executeWithRedis(idempotencyKey, operation);
        } else {
            return await this.executeWithMemory(idempotencyKey, operation);
        }
    }
    
    async executeWithRedis(idempotencyKey, operation) {
        const key = `idempotency:${idempotencyKey}`;
        
        try {
            const existingResult = await this.redis.client.get(key);
            if (existingResult) {
                return JSON.parse(existingResult);
            }
            
            const result = await operation();
            
            await this.redis.client.setEx(key, Math.ceil(this.defaultTTL / 1000), JSON.stringify(result));
            return result;
        } catch (error) {
            console.error('Idempotency check failed, executing operation:', error);
            return await operation();
        }
    }
    
    async executeWithMemory(idempotencyKey, operation) {
        const cached = this.cache.get(idempotencyKey);
        if (cached && Date.now() - cached.timestamp < this.defaultTTL) {
            return cached.result;
        }
        
        const result = await operation();
        this.cache.set(idempotencyKey, {
            result,
            timestamp: Date.now()
        });
        
        return result;
    }
    
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.defaultTTL) {
                this.cache.delete(key);
            }
        }
    }
}

class TransactionManager {
    constructor() {
        this.transactions = new Map();
    }
    
    async beginTransaction(transactionId) {
        const transaction = {
            id: transactionId,
            status: 'ACTIVE',
            operations: [],
            createdAt: new Date()
        };
        
        this.transactions.set(transactionId, transaction);
        return transaction;
    }
    
    async addOperation(transactionId, operation, compensationFn) {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }
        
        transaction.operations.push({
            operation,
            compensationFn,
            executed: false,
            result: null
        });
    }
    
    async commitTransaction(transactionId) {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }
        
        try {
            for (const op of transaction.operations) {
                op.result = await op.operation();
                op.executed = true;
            }
            
            transaction.status = 'COMMITTED';
            return transaction;
        } catch (error) {
            await this.rollbackTransaction(transactionId);
            throw error;
        }
    }
    
    async rollbackTransaction(transactionId) {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }
        
        transaction.status = 'ROLLING_BACK';
        
        for (let i = transaction.operations.length - 1; i >= 0; i--) {
            const op = transaction.operations[i];
            if (op.executed && op.compensationFn) {
                try {
                    await op.compensationFn(op.result);
                } catch (error) {
                    console.error('Compensation failed:', error);
                }
            }
        }
        
        transaction.status = 'ROLLED_BACK';
        return transaction;
    }
    
    getTransactionStatus(transactionId) {
        return this.transactions.get(transactionId);
    }
}

class TwoPhaseCommit {
    constructor() {
        this.participants = new Map();
        this.transactions = new Map();
    }
    
    registerParticipant(name, participant) {
        this.participants.set(name, participant);
    }
    
    async executeTransaction(transactionId, operations) {
        const transaction = {
            id: transactionId,
            status: 'PREPARING',
            participants: new Set(),
            results: new Map()
        };
        
        this.transactions.set(transactionId, transaction);
        
        try {
            // Phase 1: Prepare
            for (const [participantName, operation] of Object.entries(operations)) {
                const participant = this.participants.get(participantName);
                if (!participant) {
                    throw new Error(`Participant ${participantName} not found`);
                }
                
                const prepared = await participant.prepare(transactionId, operation);
                if (!prepared) {
                    throw new Error(`Participant ${participantName} failed to prepare`);
                }
                
                transaction.participants.add(participantName);
            }
            
            // Phase 2: Commit
            transaction.status = 'COMMITTING';
            for (const participantName of transaction.participants) {
                const participant = this.participants.get(participantName);
                const result = await participant.commit(transactionId);
                transaction.results.set(participantName, result);
            }
            
            transaction.status = 'COMMITTED';
            return transaction;
            
        } catch (error) {
            // Abort transaction
            transaction.status = 'ABORTING';
            for (const participantName of transaction.participants) {
                const participant = this.participants.get(participantName);
                try {
                    await participant.abort(transactionId);
                } catch (abortError) {
                    console.error(`Failed to abort participant ${participantName}:`, abortError);
                }
            }
            
            transaction.status = 'ABORTED';
            throw error;
        }
    }
}

module.exports = { DistributedLock, IdempotencyService, TransactionManager, TwoPhaseCommit };