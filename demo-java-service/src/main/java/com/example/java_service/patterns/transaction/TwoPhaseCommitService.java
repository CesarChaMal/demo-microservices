package com.example.java_service.patterns.transaction;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.List;
import java.util.ArrayList;

@Service
public class TwoPhaseCommitService {
    private final Map<String, TransactionInfo> transactions = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    
    public String startTransaction(List<String> participants) {
        String transactionId = UUID.randomUUID().toString();
        TransactionInfo transaction = new TransactionInfo(transactionId, participants);
        transactions.put(transactionId, transaction);
        
        metrics.put("transactions_started", metrics.getOrDefault("transactions_started", 0L) + 1);
        return transactionId;
    }
    
    public boolean executeTransaction(String transactionId, Map<String, Object> data) {
        TransactionInfo transaction = transactions.get(transactionId);
        if (transaction == null) return false;
        
        // Phase 1: Prepare
        boolean allPrepared = true;
        for (String participant : transaction.participants) {
            boolean prepared = prepare(participant, data);
            transaction.participantStatus.put(participant, prepared ? "PREPARED" : "ABORTED");
            if (!prepared) {
                allPrepared = false;
            }
        }
        
        // Phase 2: Commit or Abort
        if (allPrepared) {
            for (String participant : transaction.participants) {
                commit(participant, data);
                transaction.participantStatus.put(participant, "COMMITTED");
            }
            transaction.status = "COMMITTED";
            metrics.put("transactions_committed", metrics.getOrDefault("transactions_committed", 0L) + 1);
            return true;
        } else {
            for (String participant : transaction.participants) {
                if ("PREPARED".equals(transaction.participantStatus.get(participant))) {
                    abort(participant, data);
                }
                transaction.participantStatus.put(participant, "ABORTED");
            }
            transaction.status = "ABORTED";
            metrics.put("transactions_aborted", metrics.getOrDefault("transactions_aborted", 0L) + 1);
            return false;
        }
    }
    
    private boolean prepare(String participant, Map<String, Object> data) {
        // Simulate prepare phase
        return Math.random() > 0.1; // 90% success rate
    }
    
    private void commit(String participant, Map<String, Object> data) {
        // Simulate commit phase
    }
    
    private void abort(String participant, Map<String, Object> data) {
        // Simulate abort phase
    }
    
    public TransactionInfo getTransactionStatus(String transactionId) {
        return transactions.get(transactionId);
    }
    
    public Map<String, Object> getStats() {
        return Map.of(
            "active_transactions", transactions.size(),
            "transactions_started", metrics.getOrDefault("transactions_started", 0L),
            "transactions_committed", metrics.getOrDefault("transactions_committed", 0L),
            "transactions_aborted", metrics.getOrDefault("transactions_aborted", 0L)
        );
    }
    
    public static class TransactionInfo {
        public final String transactionId;
        public final List<String> participants;
        public final Map<String, String> participantStatus = new ConcurrentHashMap<>();
        public String status = "ACTIVE";
        
        public TransactionInfo(String transactionId, List<String> participants) {
            this.transactionId = transactionId;
            this.participants = new ArrayList<>(participants);
        }
    }
}