from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
import uuid
import logging
from datetime import datetime
import threading

logger = logging.getLogger(__name__)

class TransactionStatus(Enum):
    PREPARING = "PREPARING"
    PREPARED = "PREPARED"
    COMMITTED = "COMMITTED"
    ABORTED = "ABORTED"

class ParticipantStatus(Enum):
    PREPARING = "PREPARING"
    PREPARED = "PREPARED"
    COMMITTED = "COMMITTED"
    ABORTED = "ABORTED"
    FAILED = "FAILED"

@dataclass
class TransactionParticipant:
    participant_id: str
    resource_manager: str
    status: ParticipantStatus = ParticipantStatus.PREPARING
    prepare_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None

@dataclass
class GlobalTransaction:
    transaction_id: str
    coordinator_id: str
    status: TransactionStatus = TransactionStatus.PREPARING
    participants: List[TransactionParticipant] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    timeout_seconds: int = 30

class ResourceManager:
    def __init__(self, manager_id: str):
        self.manager_id = manager_id
        self.prepared_transactions: Dict[str, Any] = {}
        self.lock = threading.Lock()
    
    def prepare(self, transaction_id: str, data: Dict[str, Any]) -> bool:
        try:
            with self.lock:
                # Simulate resource preparation
                self.prepared_transactions[transaction_id] = data.copy()
                logger.info(f"Resource manager {self.manager_id} prepared transaction {transaction_id}")
                return True
        except Exception as e:
            logger.error(f"Resource manager {self.manager_id} failed to prepare {transaction_id}: {e}")
            return False
    
    def commit(self, transaction_id: str) -> bool:
        try:
            with self.lock:
                if transaction_id in self.prepared_transactions:
                    data = self.prepared_transactions.pop(transaction_id)
                    # Simulate actual commit
                    logger.info(f"Resource manager {self.manager_id} committed transaction {transaction_id}")
                    return True
                return False
        except Exception as e:
            logger.error(f"Resource manager {self.manager_id} failed to commit {transaction_id}: {e}")
            return False
    
    def abort(self, transaction_id: str) -> bool:
        try:
            with self.lock:
                if transaction_id in self.prepared_transactions:
                    self.prepared_transactions.pop(transaction_id)
                logger.info(f"Resource manager {self.manager_id} aborted transaction {transaction_id}")
                return True
        except Exception as e:
            logger.error(f"Resource manager {self.manager_id} failed to abort {transaction_id}: {e}")
            return False

class TransactionCoordinator:
    def __init__(self, coordinator_id: str):
        self.coordinator_id = coordinator_id
        self.transactions: Dict[str, GlobalTransaction] = {}
        self.resource_managers: Dict[str, ResourceManager] = {}
        self.lock = threading.Lock()
    
    def register_resource_manager(self, manager: ResourceManager):
        self.resource_managers[manager.manager_id] = manager
        logger.info(f"Registered resource manager {manager.manager_id}")
    
    def begin_transaction(self, participants: List[str]) -> str:
        transaction_id = str(uuid.uuid4())
        
        transaction = GlobalTransaction(
            transaction_id=transaction_id,
            coordinator_id=self.coordinator_id
        )
        
        for participant_id in participants:
            participant = TransactionParticipant(
                participant_id=participant_id,
                resource_manager=participant_id
            )
            transaction.participants.append(participant)
        
        with self.lock:
            self.transactions[transaction_id] = transaction
        
        logger.info(f"Started 2PC transaction {transaction_id} with participants: {participants}")
        return transaction_id
    
    def prepare_phase(self, transaction_id: str, transaction_data: Dict[str, Any]) -> bool:
        transaction = self.transactions.get(transaction_id)
        if not transaction:
            return False
        
        all_prepared = True
        
        for participant in transaction.participants:
            resource_manager = self.resource_managers.get(participant.resource_manager)
            if resource_manager:
                try:
                    participant.status = ParticipantStatus.PREPARING
                    success = resource_manager.prepare(transaction_id, transaction_data)
                    
                    if success:
                        participant.status = ParticipantStatus.PREPARED
                        participant.prepare_data = transaction_data.copy()
                    else:
                        participant.status = ParticipantStatus.FAILED
                        all_prepared = False
                except Exception as e:
                    participant.status = ParticipantStatus.FAILED
                    participant.error_message = str(e)
                    all_prepared = False
            else:
                participant.status = ParticipantStatus.FAILED
                all_prepared = False
        
        if all_prepared:
            transaction.status = TransactionStatus.PREPARED
            logger.info(f"All participants prepared for transaction {transaction_id}")
        else:
            transaction.status = TransactionStatus.ABORTED
            logger.warning(f"Not all participants prepared for transaction {transaction_id}")
        
        return all_prepared
    
    def commit_phase(self, transaction_id: str) -> bool:
        transaction = self.transactions.get(transaction_id)
        if not transaction or transaction.status != TransactionStatus.PREPARED:
            return False
        
        all_committed = True
        
        for participant in transaction.participants:
            resource_manager = self.resource_managers.get(participant.resource_manager)
            if resource_manager:
                try:
                    success = resource_manager.commit(transaction_id)
                    if success:
                        participant.status = ParticipantStatus.COMMITTED
                    else:
                        participant.status = ParticipantStatus.FAILED
                        all_committed = False
                except Exception as e:
                    participant.status = ParticipantStatus.FAILED
                    participant.error_message = str(e)
                    all_committed = False
        
        if all_committed:
            transaction.status = TransactionStatus.COMMITTED
            logger.info(f"Transaction {transaction_id} committed successfully")
        else:
            transaction.status = TransactionStatus.ABORTED
            logger.error(f"Transaction {transaction_id} failed to commit")
        
        return all_committed
    
    def abort_transaction(self, transaction_id: str):
        transaction = self.transactions.get(transaction_id)
        if not transaction:
            return
        
        for participant in transaction.participants:
            resource_manager = self.resource_managers.get(participant.resource_manager)
            if resource_manager:
                try:
                    resource_manager.abort(transaction_id)
                    participant.status = ParticipantStatus.ABORTED
                except Exception as e:
                    logger.error(f"Failed to abort participant {participant.participant_id}: {e}")
        
        transaction.status = TransactionStatus.ABORTED
        logger.info(f"Transaction {transaction_id} aborted")
    
    def execute_two_phase_commit(self, participants: List[str], transaction_data: Dict[str, Any]) -> bool:
        # Phase 1: Begin and Prepare
        transaction_id = self.begin_transaction(participants)
        
        if not self.prepare_phase(transaction_id, transaction_data):
            self.abort_transaction(transaction_id)
            return False
        
        # Phase 2: Commit
        if self.commit_phase(transaction_id):
            return True
        else:
            self.abort_transaction(transaction_id)
            return False

# Global instances
coordinator = TransactionCoordinator("main-coordinator")

# Example resource managers
database_manager = ResourceManager("database")
cache_manager = ResourceManager("cache")
file_manager = ResourceManager("file-system")

# Register resource managers
coordinator.register_resource_manager(database_manager)
coordinator.register_resource_manager(cache_manager)
coordinator.register_resource_manager(file_manager)