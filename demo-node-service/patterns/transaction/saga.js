const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

const SagaStatus = {
    STARTED: 'STARTED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    COMPENSATING: 'COMPENSATING',
    COMPENSATED: 'COMPENSATED'
};

class SagaStep {
    constructor(name, execute, compensate = null) {
        this.name = name;
        this.execute = execute;
        this.compensate = compensate;
    }
}

class SagaOrchestrator extends EventEmitter {
    constructor() {
        super();
        this.sagas = new Map();
        this.sagaDefinitions = new Map();
    }

    registerSaga(sagaType, steps) {
        this.sagaDefinitions.set(sagaType, steps);
    }

    async startSaga(sagaType, context = {}) {
        const sagaId = uuidv4();
        const steps = this.sagaDefinitions.get(sagaType);
        
        if (!steps) {
            throw new Error(`Saga type not found: ${sagaType}`);
        }

        const saga = {
            id: sagaId,
            type: sagaType,
            status: SagaStatus.STARTED,
            currentStep: 0,
            context: { ...context, sagaId },
            steps,
            completedSteps: [],
            createdAt: Date.now()
        };

        this.sagas.set(sagaId, saga);
        this.emit('saga-started', { sagaId, sagaType, context });

        // Start executing steps
        await this.executeNextStep(sagaId);
        return saga;
    }

    async executeNextStep(sagaId) {
        const saga = this.sagas.get(sagaId);
        if (!saga || saga.status !== SagaStatus.STARTED && saga.status !== SagaStatus.IN_PROGRESS) {
            return;
        }

        if (saga.currentStep >= saga.steps.length) {
            saga.status = SagaStatus.COMPLETED;
            this.emit('saga-completed', { sagaId: saga.id, context: saga.context });
            return;
        }

        saga.status = SagaStatus.IN_PROGRESS;
        const step = saga.steps[saga.currentStep];

        try {
            console.log(`Executing saga step: ${step.name} for saga: ${sagaId}`);
            const result = await step.execute(saga.context);
            
            // Update context with step result
            saga.context = { ...saga.context, ...result };
            saga.completedSteps.push(step.name);
            saga.currentStep++;

            this.emit('step-completed', { 
                sagaId, 
                stepName: step.name, 
                result, 
                context: saga.context 
            });

            // Execute next step
            await this.executeNextStep(sagaId);

        } catch (error) {
            console.error(`Saga step failed: ${step.name} for saga: ${sagaId}`, error);
            saga.status = SagaStatus.FAILED;
            saga.error = error.message;
            
            this.emit('step-failed', { 
                sagaId, 
                stepName: step.name, 
                error: error.message 
            });

            // Start compensation
            await this.compensate(sagaId);
        }
    }

    async compensate(sagaId) {
        const saga = this.sagas.get(sagaId);
        if (!saga) return;

        saga.status = SagaStatus.COMPENSATING;
        this.emit('saga-compensating', { sagaId });

        // Execute compensation in reverse order
        for (let i = saga.completedSteps.length - 1; i >= 0; i--) {
            const stepName = saga.completedSteps[i];
            const step = saga.steps.find(s => s.name === stepName);
            
            if (step && step.compensate) {
                try {
                    console.log(`Compensating step: ${stepName} for saga: ${sagaId}`);
                    await step.compensate(saga.context);
                    
                    this.emit('step-compensated', { 
                        sagaId, 
                        stepName, 
                        context: saga.context 
                    });
                } catch (error) {
                    console.error(`Compensation failed for step: ${stepName}`, error);
                    this.emit('compensation-failed', { 
                        sagaId, 
                        stepName, 
                        error: error.message 
                    });
                }
            }
        }

        saga.status = SagaStatus.COMPENSATED;
        this.emit('saga-compensated', { sagaId, context: saga.context });
    }

    getSagaStatus(sagaId) {
        return this.sagas.get(sagaId);
    }

    getAllSagas() {
        return Array.from(this.sagas.values());
    }

    getMetrics() {
        const sagas = Array.from(this.sagas.values());
        return {
            total: sagas.length,
            byStatus: sagas.reduce((acc, saga) => {
                acc[saga.status] = (acc[saga.status] || 0) + 1;
                return acc;
            }, {}),
            averageDuration: this.calculateAverageDuration(sagas)
        };
    }

    calculateAverageDuration(sagas) {
        const completedSagas = sagas.filter(s => 
            s.status === SagaStatus.COMPLETED || s.status === SagaStatus.COMPENSATED
        );
        
        if (completedSagas.length === 0) return 0;
        
        const totalDuration = completedSagas.reduce((sum, saga) => {
            return sum + (Date.now() - saga.createdAt);
        }, 0);
        
        return totalDuration / completedSagas.length;
    }
}

// Example saga steps
const createOrderProcessingSaga = () => [
    new SagaStep(
        'validate_order',
        async (context) => {
            const { orderId } = context;
            if (!orderId) throw new Error('Order ID is required');
            console.log(`Validating order: ${orderId}`);
            return { validated: true };
        },
        async (context) => {
            console.log(`Compensating order validation for: ${context.orderId}`);
        }
    ),
    new SagaStep(
        'reserve_inventory',
        async (context) => {
            const { itemId, quantity } = context;
            console.log(`Reserving inventory: ${itemId}, quantity: ${quantity}`);
            return { inventoryReserved: true, reservationId: uuidv4() };
        },
        async (context) => {
            console.log(`Releasing inventory reservation: ${context.reservationId}`);
        }
    ),
    new SagaStep(
        'process_payment',
        async (context) => {
            const { amount } = context;
            if (!amount || amount <= 0) throw new Error('Invalid payment amount');
            console.log(`Processing payment: $${amount}`);
            return { paymentProcessed: true, transactionId: uuidv4() };
        },
        async (context) => {
            console.log(`Refunding payment: ${context.transactionId}`);
        }
    )
];

module.exports = {
    SagaOrchestrator,
    SagaStep,
    SagaStatus,
    createOrderProcessingSaga
};