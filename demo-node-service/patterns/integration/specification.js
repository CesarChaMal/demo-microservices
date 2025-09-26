/**
 * Specification Pattern Implementation
 * Encapsulates business rules and criteria
 */

class Specification {
    isSatisfiedBy(candidate) {
        throw new Error('isSatisfiedBy must be implemented');
    }
    
    and(other) {
        return new AndSpecification(this, other);
    }
    
    or(other) {
        return new OrSpecification(this, other);
    }
    
    not() {
        return new NotSpecification(this);
    }
}

class AndSpecification extends Specification {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }
    
    isSatisfiedBy(candidate) {
        return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
    }
}

class OrSpecification extends Specification {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }
    
    isSatisfiedBy(candidate) {
        return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
    }
}

class NotSpecification extends Specification {
    constructor(spec) {
        super();
        this.spec = spec;
    }
    
    isSatisfiedBy(candidate) {
        return !this.spec.isSatisfiedBy(candidate);
    }
}

// Business specifications
class ActiveUserSpecification extends Specification {
    isSatisfiedBy(user) {
        return user.active === true;
    }
}

class PremiumUserSpecification extends Specification {
    isSatisfiedBy(user) {
        return user.subscriptionType === 'premium';
    }
}

class MinAgeSpecification extends Specification {
    constructor(minAge) {
        super();
        this.minAge = minAge;
    }
    
    isSatisfiedBy(user) {
        return user.age >= this.minAge;
    }
}

class OrderValueSpecification extends Specification {
    constructor(minValue) {
        super();
        this.minValue = minValue;
    }
    
    isSatisfiedBy(order) {
        return order.amount >= this.minValue;
    }
}

class PendingOrderSpecification extends Specification {
    isSatisfiedBy(order) {
        return order.status === 'pending';
    }
}

// Specification service for managing business rules
class SpecificationService {
    constructor() {
        this.metrics = {
            evaluations: 0,
            satisfied: 0,
            notSatisfied: 0
        };
    }
    
    evaluate(specification, candidate) {
        this.metrics.evaluations++;
        const result = specification.isSatisfiedBy(candidate);
        
        if (result) {
            this.metrics.satisfied++;
        } else {
            this.metrics.notSatisfied++;
        }
        
        console.log(`Specification evaluation: ${result} for candidate:`, candidate);
        return result;
    }
    
    filter(specification, candidates) {
        return candidates.filter(candidate => this.evaluate(specification, candidate));
    }
    
    getMetrics() {
        return {
            totalEvaluations: this.metrics.evaluations,
            satisfied: this.metrics.satisfied,
            notSatisfied: this.metrics.notSatisfied,
            satisfactionRate: this.metrics.satisfied / Math.max(1, this.metrics.evaluations)
        };
    }
}

// Global instances
const specificationService = new SpecificationService();

// Pre-defined specifications
const activeUserSpec = new ActiveUserSpecification();
const premiumUserSpec = new PremiumUserSpecification();
const adultUserSpec = new MinAgeSpecification(18);
const highValueOrderSpec = new OrderValueSpecification(100);
const pendingOrderSpec = new PendingOrderSpecification();

// Complex specifications
const eligibleUserSpec = activeUserSpec.and(adultUserSpec);
const premiumAdultSpec = premiumUserSpec.and(adultUserSpec);
const highValuePendingOrderSpec = highValueOrderSpec.and(pendingOrderSpec);

module.exports = {
    Specification,
    AndSpecification,
    OrSpecification,
    NotSpecification,
    ActiveUserSpecification,
    PremiumUserSpecification,
    MinAgeSpecification,
    OrderValueSpecification,
    PendingOrderSpecification,
    SpecificationService,
    specificationService,
    activeUserSpec,
    premiumUserSpec,
    adultUserSpec,
    highValueOrderSpec,
    pendingOrderSpec,
    eligibleUserSpec,
    premiumAdultSpec,
    highValuePendingOrderSpec
};