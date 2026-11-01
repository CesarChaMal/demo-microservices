const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class InboxPattern extends EventEmitter {
    constructor() {
        super();
        this.processedMessages = new Set();
        this.inboxEvents = new Map();
    }
    
    async handleMessage(messageId, eventData) {
        if (this.processedMessages.has(messageId)) {
            this.emit('duplicateMessage', { messageId });
            return true;
        }
        
        const inboxEvent = {
            messageId,
            eventData,
            receivedAt: Date.now(),
            processed: false
        };
        
        this.inboxEvents.set(messageId, inboxEvent);
        
        try {
            await this.processEvent(eventData);
            inboxEvent.processed = true;
            this.processedMessages.add(messageId);
            this.emit('messageProcessed', { messageId, eventData });
            return true;
        } catch (error) {
            this.emit('messageProcessingFailed', { messageId, error: error.message });
            return false;
        }
    }
    
    async processEvent(eventData) {
        // Override in subclasses or provide custom processor
        this.emit('eventProcessed', eventData);
    }
    
    getProcessedCount() {
        return this.processedMessages.size;
    }
    
    getPendingCount() {
        return Array.from(this.inboxEvents.values())
            .filter(event => !event.processed).length;
    }
    
    getStats() {
        return {
            processedCount: this.getProcessedCount(),
            pendingCount: this.getPendingCount(),
            totalReceived: this.inboxEvents.size
        };
    }
}

class TwoPhaseCommit extends EventEmitter {
    constructor() {
        super();
        this.participants = new Map();
        this.transactions = new Map();
    }
    
    addParticipant(name, participant) {
        this.participants.set(name, participant);
    }
    
    async executeTransaction(txId, operations) {
        const transaction = {
            id: txId,
            status: 'PREPARING',
            operations,
            participants: Object.keys(operations),
            createdAt: Date.now()
        };
        
        this.transactions.set(txId, transaction);
        this.emit('transactionStarted', { txId, operations });
        
        try {
            // Phase 1: Prepare
            for (const [name, operation] of Object.entries(operations)) {
                const participant = this.participants.get(name);
                if (!participant) {
                    throw new Error(`Participant ${name} not found`);
                }
                
                const prepared = await participant.prepare(txId, operation);
                if (!prepared) {
                    await this.abortTransaction(txId);
                    throw new Error(`${name} failed to prepare`);
                }
            }
            
            transaction.status = 'COMMITTING';
            
            // Phase 2: Commit
            for (const name of Object.keys(operations)) {
                await this.participants.get(name).commit(txId);
            }
            
            transaction.status = 'COMMITTED';
            transaction.completedAt = Date.now();
            
            this.emit('transactionCommitted', { txId, transaction });
            return transaction;
            
        } catch (error) {
            await this.abortTransaction(txId);
            this.emit('transactionFailed', { txId, error: error.message });
            throw error;
        }
    }
    
    async abortTransaction(txId) {
        const transaction = this.transactions.get(txId);
        if (transaction) {
            transaction.status = 'ABORTING';
            
            for (const participantName of transaction.participants) {
                const participant = this.participants.get(participantName);
                if (participant) {
                    try {
                        await participant.abort(txId);
                    } catch (error) {
                        this.emit('participantAbortFailed', { 
                            participant: participantName, 
                            txId, 
                            error: error.message 
                        });
                    }
                }
            }
            
            transaction.status = 'ABORTED';
            transaction.abortedAt = Date.now();
            this.emit('transactionAborted', { txId });
        }
    }
    
    getTransactionStatus(txId) {
        return this.transactions.get(txId);
    }
    
    getStats() {
        const transactions = Array.from(this.transactions.values());
        return {
            totalTransactions: transactions.length,
            committed: transactions.filter(t => t.status === 'COMMITTED').length,
            aborted: transactions.filter(t => t.status === 'ABORTED').length,
            inProgress: transactions.filter(t => ['PREPARING', 'COMMITTING', 'ABORTING'].includes(t.status)).length,
            participants: this.participants.size
        };
    }
}

class TwoPhaseCommitParticipant extends EventEmitter {
    constructor(name) {
        super();
        this.name = name;
        this.preparedTransactions = new Set();
    }
    
    async prepare(txId, operation) {
        try {
            await this.validateOperation(operation);
            this.preparedTransactions.add(txId);
            this.emit('prepared', { txId, participant: this.name });
            return true;
        } catch (error) {
            this.emit('prepareFailed', { txId, participant: this.name, error: error.message });
            return false;
        }
    }
    
    async commit(txId) {
        if (!this.preparedTransactions.has(txId)) {
            throw new Error(`Transaction ${txId} not prepared`);
        }
        
        try {
            await this.executeCommit(txId);
            this.preparedTransactions.delete(txId);
            this.emit('committed', { txId, participant: this.name });
        } catch (error) {
            this.emit('commitFailed', { txId, participant: this.name, error: error.message });
            throw error;
        }
    }
    
    async abort(txId) {
        if (this.preparedTransactions.has(txId)) {
            this.preparedTransactions.delete(txId);
        }
        await this.executeAbort(txId);
        this.emit('aborted', { txId, participant: this.name });
    }
    
    async validateOperation(operation) {
        // Override in subclasses
        return true;
    }
    
    async executeCommit(txId) {
        // Override in subclasses
    }
    
    async executeAbort(txId) {
        // Override in subclasses
    }
    
    getStats() {
        return {
            name: this.name,
            preparedTransactions: this.preparedTransactions.size
        };
    }
}

module.exports = {
    InboxPattern,
    TwoPhaseCommit,
    TwoPhaseCommitParticipant
};