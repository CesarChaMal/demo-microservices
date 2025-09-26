/**
 * Repository Pattern Implementation
 * Encapsulates data access logic
 */

class BaseRepository {
    constructor(entityName) {
        this.entityName = entityName;
        this.data = new Map();
        this.metrics = {
            reads: 0,
            writes: 0,
            deletes: 0
        };
    }
    
    async findById(id) {
        this.metrics.reads++;
        const entity = this.data.get(id);
        console.log(`Repository: Finding ${this.entityName} by ID: ${id}`);
        return entity || null;
    }
    
    async findAll() {
        this.metrics.reads++;
        console.log(`Repository: Finding all ${this.entityName}s`);
        return Array.from(this.data.values());
    }
    
    async save(entity) {
        this.metrics.writes++;
        const id = entity.id || this._generateId();
        entity.id = id;
        entity.updatedAt = new Date();
        
        this.data.set(id, { ...entity });
        console.log(`Repository: Saved ${this.entityName} with ID: ${id}`);
        return entity;
    }
    
    async delete(id) {
        this.metrics.deletes++;
        const deleted = this.data.delete(id);
        console.log(`Repository: Deleted ${this.entityName} with ID: ${id}, success: ${deleted}`);
        return deleted;
    }
    
    async findBy(criteria) {
        this.metrics.reads++;
        const results = Array.from(this.data.values()).filter(entity => {
            return Object.keys(criteria).every(key => entity[key] === criteria[key]);
        });
        console.log(`Repository: Found ${results.length} ${this.entityName}s matching criteria`);
        return results;
    }
    
    _generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }
    
    getMetrics() {
        return {
            entityName: this.entityName,
            totalEntities: this.data.size,
            reads: this.metrics.reads,
            writes: this.metrics.writes,
            deletes: this.metrics.deletes
        };
    }
}

class UserRepository extends BaseRepository {
    constructor() {
        super('User');
    }
    
    async findByEmail(email) {
        return this.findBy({ email });
    }
    
    async findActiveUsers() {
        return this.findBy({ active: true });
    }
}

class OrderRepository extends BaseRepository {
    constructor() {
        super('Order');
    }
    
    async findByUserId(userId) {
        return this.findBy({ userId });
    }
    
    async findByStatus(status) {
        return this.findBy({ status });
    }
}

// Global instances
const userRepository = new UserRepository();
const orderRepository = new OrderRepository();

// Initialize sample data
userRepository.save({ email: 'user1@example.com', name: 'User One', active: true });
userRepository.save({ email: 'user2@example.com', name: 'User Two', active: false });
orderRepository.save({ userId: '1', amount: 100, status: 'pending' });
orderRepository.save({ userId: '1', amount: 200, status: 'completed' });

module.exports = { 
    BaseRepository, 
    UserRepository, 
    OrderRepository,
    userRepository,
    orderRepository
};