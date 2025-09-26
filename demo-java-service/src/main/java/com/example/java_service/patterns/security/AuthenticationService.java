package com.example.java_service.patterns.security;

import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AuthenticationService {
    
    private static final Logger logger = LoggerFactory.getLogger(AuthenticationService.class);
    private final Map<String, TokenInfo> tokens = new ConcurrentHashMap<>();
    private final Map<String, Long> metrics = new ConcurrentHashMap<>();
    private final String secretKey;
    
    public AuthenticationService() {
        this.secretKey = System.getenv().getOrDefault("JWT_SECRET", "demo-secret-change-in-production");
    }
    
    public String generateToken(String userId, List<String> roles) {
        String token = UUID.randomUUID().toString();
        TokenInfo tokenInfo = new TokenInfo(userId, roles, Instant.now().plus(1, ChronoUnit.HOURS));
        
        tokens.put(token, tokenInfo);
        metrics.put("tokens_generated", metrics.getOrDefault("tokens_generated", 0L) + 1);
        
        logger.info("Generated token for user: {}", userId);
        return token;
    }
    
    public Optional<TokenInfo> validateToken(String token) {
        TokenInfo tokenInfo = tokens.get(token);
        
        if (tokenInfo == null) {
            metrics.put("token_not_found", metrics.getOrDefault("token_not_found", 0L) + 1);
            return Optional.empty();
        }
        
        if (tokenInfo.expiresAt.isBefore(Instant.now())) {
            tokens.remove(token);
            metrics.put("token_expired", metrics.getOrDefault("token_expired", 0L) + 1);
            return Optional.empty();
        }
        
        metrics.put("token_validated", metrics.getOrDefault("token_validated", 0L) + 1);
        return Optional.of(tokenInfo);
    }
    
    public boolean hasRole(String token, String requiredRole) {
        return validateToken(token)
            .map(tokenInfo -> tokenInfo.roles.contains(requiredRole))
            .orElse(false);
    }
    
    public void revokeToken(String token) {
        TokenInfo removed = tokens.remove(token);
        if (removed != null) {
            metrics.put("tokens_revoked", metrics.getOrDefault("tokens_revoked", 0L) + 1);
            logger.info("Revoked token for user: {}", removed.userId);
        }
    }
    
    public Map<String, Object> getAuthStats() {
        Map<String, Object> stats = new ConcurrentHashMap<>(metrics);
        stats.put("active_tokens", tokens.size());
        
        // Clean expired tokens
        long expiredCount = tokens.entrySet().removeIf(entry -> 
            entry.getValue().expiresAt.isBefore(Instant.now()));
        if (expiredCount > 0) {
            metrics.put("tokens_expired_cleanup", 
                metrics.getOrDefault("tokens_expired_cleanup", 0L) + expiredCount);
        }
        
        return stats;
    }
    
    public static class TokenInfo {
        public final String userId;
        public final List<String> roles;
        public final Instant expiresAt;
        
        public TokenInfo(String userId, List<String> roles, Instant expiresAt) {
            this.userId = userId;
            this.roles = new ArrayList<>(roles);
            this.expiresAt = expiresAt;
        }
    }
}