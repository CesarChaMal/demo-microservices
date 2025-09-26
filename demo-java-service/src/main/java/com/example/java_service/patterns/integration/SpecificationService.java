package com.example.java_service.patterns.integration;

import org.springframework.stereotype.Service;
import java.util.function.Predicate;

@Service
public class SpecificationService {
    
    public interface Specification<T> {
        boolean isSatisfiedBy(T candidate);
        
        default Specification<T> and(Specification<T> other) {
            return candidate -> this.isSatisfiedBy(candidate) && other.isSatisfiedBy(candidate);
        }
        
        default Specification<T> or(Specification<T> other) {
            return candidate -> this.isSatisfiedBy(candidate) || other.isSatisfiedBy(candidate);
        }
        
        default Specification<T> not() {
            return candidate -> !this.isSatisfiedBy(candidate);
        }
    }
    
    public static class ValueGreaterThanSpecification implements Specification<Integer> {
        private final int threshold;
        
        public ValueGreaterThanSpecification(int threshold) {
            this.threshold = threshold;
        }
        
        @Override
        public boolean isSatisfiedBy(Integer candidate) {
            return candidate > threshold;
        }
    }
    
    public static class ValueEvenSpecification implements Specification<Integer> {
        @Override
        public boolean isSatisfiedBy(Integer candidate) {
            return candidate % 2 == 0;
        }
    }
}