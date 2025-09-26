import time
import uuid
from typing import Dict, Any, Set
import logging

logger = logging.getLogger(__name__)

class InboxPattern:
    def __init__(self):
        self.processed_messages: Set[str] = set()
        self.inbox_events: Dict[str, Dict[str, Any]] = {}
        
    def handle_message(self, message_id: str, event_data: Dict[str, Any]) -> bool:
        """Handle incoming message with idempotency"""
        if message_id in self.processed_messages:
            logger.info(f"Message already processed: {message_id}")
            return True
            
        inbox_event = {
            'message_id': message_id,
            'event_data': event_data,
            'received_at': time.time(),
            'processed': False
        }
        
        self.inbox_events[message_id] = inbox_event
        
        try:
            self.process_event(event_data)
            inbox_event['processed'] = True
            self.processed_messages.add(message_id)
            logger.info(f"Successfully processed message: {message_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to process message {message_id}: {e}")
            return False
            
    def process_event(self, event_data: Dict[str, Any]):
        """Process the event - override in subclasses"""
        logger.info(f"Processing event: {event_data}")
        
    def get_processed_count(self) -> int:
        """Get count of processed messages"""
        return len(self.processed_messages)
        
    def get_pending_count(self) -> int:
        """Get count of pending messages"""
        return len([e for e in self.inbox_events.values() if not e['processed']])

class TwoPhaseCommit:
    def __init__(self):
        self.participants = {}
        self.transactions = {}
        
    def add_participant(self, name: str, participant):
        """Add a participant to the 2PC protocol"""
        self.participants[name] = participant
        
    def execute_transaction(self, tx_id: str, operations: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a two-phase commit transaction"""
        transaction = {
            'id': tx_id,
            'status': 'PREPARING',
            'operations': operations,
            'participants': list(operations.keys()),
            'created_at': time.time()
        }
        
        self.transactions[tx_id] = transaction
        
        try:
            # Phase 1: Prepare
            logger.info(f"Starting 2PC transaction {tx_id} - Phase 1: Prepare")
            for name, operation in operations.items():
                participant = self.participants.get(name)
                if not participant or not participant.prepare(tx_id, operation):
                    self.abort_transaction(tx_id)
                    raise Exception(f"{name} failed to prepare")
                    
            transaction['status'] = 'COMMITTING'
            
            # Phase 2: Commit
            logger.info(f"2PC transaction {tx_id} - Phase 2: Commit")
            for name in operations.keys():
                self.participants[name].commit(tx_id)
                
            transaction['status'] = 'COMMITTED'
            transaction['completed_at'] = time.time()
            logger.info(f"2PC transaction {tx_id} committed successfully")
            return transaction
            
        except Exception as e:
            self.abort_transaction(tx_id)
            raise e
            
    def abort_transaction(self, tx_id: str):
        """Abort a transaction and run compensation"""
        transaction = self.transactions.get(tx_id)
        if transaction:
            transaction['status'] = 'ABORTING'
            logger.info(f"Aborting 2PC transaction {tx_id}")
            
            for participant_name in transaction['participants']:
                participant = self.participants.get(participant_name)
                if participant:
                    try:
                        participant.abort(tx_id)
                    except Exception as e:
                        logger.error(f"Failed to abort participant {participant_name}: {e}")
                        
            transaction['status'] = 'ABORTED'
            transaction['aborted_at'] = time.time()

class TwoPhaseCommitParticipant:
    """Base class for 2PC participants"""
    
    def __init__(self, name: str):
        self.name = name
        self.prepared_transactions = set()
        
    def prepare(self, tx_id: str, operation: Any) -> bool:
        """Prepare phase - return True if ready to commit"""
        try:
            # Validate operation
            self.validate_operation(operation)
            self.prepared_transactions.add(tx_id)
            logger.info(f"Participant {self.name} prepared for transaction {tx_id}")
            return True
        except Exception as e:
            logger.error(f"Participant {self.name} failed to prepare for {tx_id}: {e}")
            return False
            
    def commit(self, tx_id: str):
        """Commit phase - execute the operation"""
        if tx_id in self.prepared_transactions:
            try:
                self.execute_commit(tx_id)
                self.prepared_transactions.remove(tx_id)
                logger.info(f"Participant {self.name} committed transaction {tx_id}")
            except Exception as e:
                logger.error(f"Participant {self.name} failed to commit {tx_id}: {e}")
                raise e
        else:
            raise Exception(f"Transaction {tx_id} not prepared")
            
    def abort(self, tx_id: str):
        """Abort phase - cleanup resources"""
        if tx_id in self.prepared_transactions:
            self.prepared_transactions.remove(tx_id)
        self.execute_abort(tx_id)
        logger.info(f"Participant {self.name} aborted transaction {tx_id}")
        
    def validate_operation(self, operation: Any):
        """Override to validate operation"""
        pass
        
    def execute_commit(self, tx_id: str):
        """Override to execute commit"""
        pass
        
    def execute_abort(self, tx_id: str):
        """Override to execute abort"""
        pass