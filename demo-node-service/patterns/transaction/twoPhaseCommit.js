const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

const TransactionStatus = {
    PREPARING: 'PREPARING',
    PREPARED: 'PREPARED',
    COMMITTED: 'COMMITTED',
    ABORTED: 'ABORTED'
};

const ParticipantStatus = {
    PREPARING: 'PREPARING',
    PREPARED: 'PREPARED',
    COMMITTED: 'COMMITTED',
    ABORTED: 'ABORTED',
    FAILED: 'FAILED'
};

class TransactionParticipant {
    constructor(participantId, resourceManager) {
        this.participantId = participantId;
        this.resourceManager = resourceManager;
        this.status = ParticipantStatus.PREPARING;
        this.prepareData = null;
        this.errorMessage = null;
    }
}

class GlobalTransaction {
    constructor(transactionId, coordinatorId) {
        this.transactionId = transactionId;
        this.coordinatorId = coordinatorId;
        this.status = TransactionStatus.PREPARING;
        this.participants = [];
        this.createdAt = Date.now();
        this.timeoutSeconds = 30;
    }

    addParticipant(participant) {
        this.participants.push(participant);
    }
}

class ResourceManager extends EventEmitter {
    constructor(managerId) {
        super();
        this.managerId = managerId;
        this.preparedTransactions = new Map();
    }

    async prepare(transactionId, data) {
        try {
            // Simulate resource preparation
            this.preparedTransactions.set(transactionId, { ...data });
            console.log(`Resource manager ${this.managerId} prepared transaction ${transactionId}`);
            
            this.emit('prepared', { managerId: this.managerId, transactionId });
            return true;
        } catch (error) {
            console.error(`Resource manager ${this.managerId} failed to prepare ${transactionId}:`, error);
            this.emit('prepare-failed', { managerId: this.managerId, transactionId, error });
            return false;
        }
    }

    async commit(transactionId) {
        try {
            const data = this.preparedTransactions.get(transactionId);
            if (data) {
                this.preparedTransactions.delete(transactionId);
                // Simulate actual commit
                console.log(`Resource manager ${this.managerId} committed transaction ${transactionId}`);
                
                this.emit('committed', { managerId: this.managerId, transactionId });
                return true;
            }
            return false;
        } catch (error) {
            console.error(`Resource manager ${this.managerId} failed to commit ${transactionId}:`, error);
            this.emit('commit-failed', { managerId: this.managerId, transactionId, error });
            return false;
        }
    }

    async abort(transactionId) {
        try {
            this.preparedTransactions.delete(transactionId);
            console.log(`Resource manager ${this.managerId} aborted transaction ${transactionId}`);
            
            this.emit('aborted', { managerId: this.managerId, transactionId });
            return true;
        } catch (error) {
            console.error(`Resource manager ${this.managerId} failed to abort ${transactionId}:`, error);
            return false;
        }
    }

    getStats() {
        return {
            managerId: this.managerId,
            preparedTransactions: this.preparedTransactions.size,
            transactions: Array.from(this.preparedTransactions.keys())
        };
    }
}

class TransactionCoordinator extends EventEmitter {
    constructor(coordinatorId) {
        super();
        this.coordinatorId = coordinatorId;
        this.transactions = new Map();
        this.resourceManagers = new Map();
    }

    registerResourceManager(manager) {
        this.resourceManagers.set(manager.managerId, manager);
        console.log(`Registered resource manager ${manager.managerId}`);
        
        // Listen to resource manager events
        manager.on('prepared', (event) => this.emit('participant-prepared', event));
        manager.on('committed', (event) => this.emit('participant-committed', event));
        manager.on('aborted', (event) => this.emit('participant-aborted', event));
    }

    beginTransaction(participants) {
        const transactionId = uuidv4();
        const transaction = new GlobalTransaction(transactionId, this.coordinatorId);

        for (const participantId of participants) {
            const participant = new TransactionParticipant(participantId, participantId);
            transaction.addParticipant(participant);
        }

        this.transactions.set(transactionId, transaction);
        console.log(`Started 2PC transaction ${transactionId} with participants: ${participants.join(', ')}`);
        
        this.emit('transaction-started', { transactionId, participants });
        return transactionId;
    }

    async preparePhase(transactionId, transactionData) {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction not found: ${transactionId}`);
        }

        let allPrepared = true;

        for (const participant of transaction.participants) {
            const resourceManager = this.resourceManagers.get(participant.resourceManager);
            if (resourceManager) {
                try {
                    participant.status = ParticipantStatus.PREPARING;
                    const success = await resourceManager.prepare(transactionId, transactionData);

                    if (success) {
                        participant.status = ParticipantStatus.PREPARED;
                        participant.prepareData = { ...transactionData };
                    } else {
                        participant.status = ParticipantStatus.FAILED;
                        allPrepared = false;
                    }
                } catch (error) {
                    participant.status = ParticipantStatus.FAILED;
                    participant.errorMessage = error.message;
                    allPrepared = false;
                }
            } else {
                participant.status = ParticipantStatus.FAILED;
                participant.errorMessage = 'Resource manager not found';
                allPrepared = false;
            }
        }

        if (allPrepared) {
            transaction.status = TransactionStatus.PREPARED;
            console.log(`All participants prepared for transaction ${transactionId}`);
            this.emit('all-prepared', { transactionId });
        } else {
            transaction.status = TransactionStatus.ABORTED;
            console.warn(`Not all participants prepared for transaction ${transactionId}`);
            this.emit('prepare-failed', { transactionId });
        }

        return allPrepared;
    }

    async commitPhase(transactionId) {
        const transaction = this.transactions.get(transactionId);
        if (!transaction || transaction.status !== TransactionStatus.PREPARED) {
            throw new Error(`Transaction not in prepared state: ${transactionId}`);
        }

        let allCommitted = true;

        for (const participant of transaction.participants) {
            const resourceManager = this.resourceManagers.get(participant.resourceManager);
            if (resourceManager) {
                try {
                    const success = await resourceManager.commit(transactionId);
                    if (success) {
                        participant.status = ParticipantStatus.COMMITTED;
                    } else {
                        participant.status = ParticipantStatus.FAILED;
                        allCommitted = false;
                    }
                } catch (error) {
                    participant.status = ParticipantStatus.FAILED;
                    participant.errorMessage = error.message;
                    allCommitted = false;
                }
            }
        }

        if (allCommitted) {
            transaction.status = TransactionStatus.COMMITTED;
            console.log(`Transaction ${transactionId} committed successfully`);
            this.emit('transaction-committed', { transactionId });
        } else {
            transaction.status = TransactionStatus.ABORTED;
            console.error(`Transaction ${transactionId} failed to commit`);
            this.emit('transaction-failed', { transactionId });
        }

        return allCommitted;
    }

    async abortTransaction(transactionId) {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) return;

        for (const participant of transaction.participants) {
            const resourceManager = this.resourceManagers.get(participant.resourceManager);
            if (resourceManager) {
                try {
                    await resourceManager.abort(transactionId);
                    participant.status = ParticipantStatus.ABORTED;
                } catch (error) {
                    console.error(`Failed to abort participant ${participant.participantId}:`, error);
                }
            }
        }

        transaction.status = TransactionStatus.ABORTED;
        console.log(`Transaction ${transactionId} aborted`);
        this.emit('transaction-aborted', { transactionId });
    }

    async executeTwoPhaseCommit(participants, transactionData) {
        // Phase 1: Begin and Prepare
        const transactionId = this.beginTransaction(participants);

        try {
            const prepared = await this.preparePhase(transactionId, transactionData);
            if (!prepared) {
                await this.abortTransaction(transactionId);
                return { success: false, transactionId, phase: 'prepare' };
            }

            // Phase 2: Commit
            const committed = await this.commitPhase(transactionId);
            if (committed) {
                return { success: true, transactionId, phase: 'commit' };
            } else {
                await this.abortTransaction(transactionId);
                return { success: false, transactionId, phase: 'commit' };
            }
        } catch (error) {
            await this.abortTransaction(transactionId);
            throw error;
        }
    }

    getTransactionStatus(transactionId) {
        return this.transactions.get(transactionId);
    }

    getStats() {
        const transactions = Array.from(this.transactions.values());
        return {
            totalTransactions: transactions.length,
            byStatus: transactions.reduce((acc, tx) => {
                acc[tx.status] = (acc[tx.status] || 0) + 1;
                return acc;
            }, {}),
            resourceManagers: Array.from(this.resourceManagers.keys())
        };
    }
}

module.exports = {
    TransactionCoordinator,
    ResourceManager,
    TransactionParticipant,
    GlobalTransaction,
    TransactionStatus,
    ParticipantStatus
};