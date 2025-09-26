from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Callable, Any
import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class SagaStatus(Enum):
    STARTED = "STARTED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    COMPENSATING = "COMPENSATING"
    COMPENSATED = "COMPENSATED"

@dataclass
class SagaState:
    saga_id: str
    current_step: str
    status: SagaStatus
    context: Dict[str, Any] = field(default_factory=dict)
    completed_steps: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)

class SagaOrchestrator:
    def __init__(self):
        self.sagas: Dict[str, SagaState] = {}
        self.steps: Dict[str, Callable] = {}
        self.compensations: Dict[str, Callable] = {}
    
    def register_step(self, step_name: str, action: Callable, compensation: Callable):
        self.steps[step_name] = action
        self.compensations[step_name] = compensation
    
    def start_saga(self, saga_type: str, context: Dict[str, Any]) -> str:
        saga_id = str(uuid.uuid4())
        saga = SagaState(
            saga_id=saga_id,
            current_step="START",
            status=SagaStatus.STARTED,
            context=context
        )
        self.sagas[saga_id] = saga
        logger.info(f"Started saga {saga_id} of type {saga_type}")
        return saga_id
    
    def execute_step(self, saga_id: str, step_name: str) -> bool:
        saga = self.sagas.get(saga_id)
        if not saga:
            return False
        
        try:
            if step_name in self.steps:
                result = self.steps[step_name](saga.context)
                saga.completed_steps.append(step_name)
                saga.current_step = step_name
                logger.info(f"Saga {saga_id} completed step {step_name}")
                return True
        except Exception as e:
            logger.error(f"Saga {saga_id} failed at step {step_name}: {e}")
            saga.status = SagaStatus.FAILED
            self.compensate(saga_id)
            return False
        
        return False
    
    def compensate(self, saga_id: str):
        saga = self.sagas.get(saga_id)
        if not saga:
            return
        
        saga.status = SagaStatus.COMPENSATING
        
        # Execute compensations in reverse order
        for step in reversed(saga.completed_steps):
            if step in self.compensations:
                try:
                    self.compensations[step](saga.context)
                    logger.info(f"Compensated step {step} for saga {saga_id}")
                except Exception as e:
                    logger.error(f"Compensation failed for step {step}: {e}")
        
        saga.status = SagaStatus.COMPENSATED
    
    def complete_saga(self, saga_id: str):
        saga = self.sagas.get(saga_id)
        if saga:
            saga.status = SagaStatus.COMPLETED
            logger.info(f"Saga {saga_id} completed successfully")

# Global saga orchestrator instance
saga_orchestrator = SagaOrchestrator()

# Example saga steps
def validate_order(context):
    order_id = context.get('order_id')
    if not order_id:
        raise ValueError("Order ID is required")
    context['validated'] = True
    return True

def compensate_validate_order(context):
    context['validated'] = False
    logger.info("Compensated order validation")

def reserve_inventory(context):
    item_id = context.get('item_id')
    quantity = context.get('quantity', 1)
    context['reserved_inventory'] = {'item_id': item_id, 'quantity': quantity}
    return True

def compensate_reserve_inventory(context):
    reserved = context.get('reserved_inventory')
    if reserved:
        logger.info(f"Released inventory: {reserved}")
    context['reserved_inventory'] = None

def process_payment(context):
    amount = context.get('amount')
    if not amount or amount <= 0:
        raise ValueError("Invalid payment amount")
    context['payment_processed'] = True
    return True

def compensate_process_payment(context):
    if context.get('payment_processed'):
        logger.info("Refunded payment")
    context['payment_processed'] = False

# Register saga steps
saga_orchestrator.register_step('validate_order', validate_order, compensate_validate_order)
saga_orchestrator.register_step('reserve_inventory', reserve_inventory, compensate_reserve_inventory)
saga_orchestrator.register_step('process_payment', process_payment, compensate_process_payment)