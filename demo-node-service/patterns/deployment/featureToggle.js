class FeatureToggle {
    constructor(options = {}) {
        this.features = new Map();
        this.rules = new Map();
        this.defaultValue = options.defaultValue || false;
        this.loadFeatures(options.features || {});
    }
    
    loadFeatures(features) {
        for (const [name, config] of Object.entries(features)) {
            this.features.set(name, {
                enabled: config.enabled || this.defaultValue,
                description: config.description || '',
                rules: config.rules || [],
                rolloutPercentage: config.rolloutPercentage || 100,
                enabledForUsers: config.enabledForUsers || [],
                enabledForGroups: config.enabledForGroups || [],
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
    }
    
    isEnabled(featureName, context = {}) {
        const feature = this.features.get(featureName);
        if (!feature) {
            return this.defaultValue;
        }
        
        if (!feature.enabled) {
            return false;
        }
        
        // Check user-specific enablement
        if (context.userId && feature.enabledForUsers.includes(context.userId)) {
            return true;
        }
        
        // Check group-specific enablement
        if (context.userGroups) {
            const hasEnabledGroup = context.userGroups.some(group => 
                feature.enabledForGroups.includes(group)
            );
            if (hasEnabledGroup) {
                return true;
            }
        }
        
        // Check rollout percentage
        if (feature.rolloutPercentage < 100) {
            const hash = this.hashString(featureName + (context.userId || ''));
            const percentage = (hash % 100) + 1;
            if (percentage > feature.rolloutPercentage) {
                return false;
            }
        }
        
        // Check custom rules
        for (const rule of feature.rules) {
            if (!this.evaluateRule(rule, context)) {
                return false;
            }
        }
        
        return true;
    }
    
    evaluateRule(rule, context) {
        switch (rule.type) {
            case 'user_attribute':
                return context[rule.attribute] === rule.value;
            case 'date_range':
                const now = new Date();
                const start = new Date(rule.startDate);
                const end = new Date(rule.endDate);
                return now >= start && now <= end;
            case 'environment':
                return context.environment === rule.value;
            case 'version':
                return this.compareVersions(context.version, rule.operator, rule.value);
            default:
                return true;
        }
    }
    
    compareVersions(version1, operator, version2) {
        if (!version1 || !version2) return false;
        
        const v1Parts = version1.split('.').map(Number);
        const v2Parts = version2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;
            
            if (v1Part !== v2Part) {
                switch (operator) {
                    case '>': return v1Part > v2Part;
                    case '>=': return v1Part >= v2Part;
                    case '<': return v1Part < v2Part;
                    case '<=': return v1Part <= v2Part;
                    case '==': return v1Part === v2Part;
                    default: return false;
                }
            }
        }
        
        return operator === '>=' || operator === '<=' || operator === '==';
    }
    
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    
    enableFeature(featureName, description = '') {
        const feature = this.features.get(featureName) || {};
        this.features.set(featureName, {
            ...feature,
            enabled: true,
            description,
            updatedAt: new Date()
        });
    }
    
    disableFeature(featureName) {
        const feature = this.features.get(featureName);
        if (feature) {
            feature.enabled = false;
            feature.updatedAt = new Date();
        }
    }
    
    setRolloutPercentage(featureName, percentage) {
        const feature = this.features.get(featureName);
        if (feature) {
            feature.rolloutPercentage = Math.max(0, Math.min(100, percentage));
            feature.updatedAt = new Date();
        }
    }
    
    getAllFeatures() {
        return Object.fromEntries(this.features);
    }
    
    getFeatureStats() {
        const features = Array.from(this.features.values());
        return {
            total: features.length,
            enabled: features.filter(f => f.enabled).length,
            disabled: features.filter(f => !f.enabled).length,
            withRollout: features.filter(f => f.rolloutPercentage < 100).length
        };
    }
}

class CanaryDeployment {
    constructor(options = {}) {
        this.canaryPercentage = options.canaryPercentage || 10;
        this.canaryVersion = options.canaryVersion || 'v2';
        this.stableVersion = options.stableVersion || 'v1';
        this.metrics = {
            canaryRequests: 0,
            stableRequests: 0,
            canaryErrors: 0,
            stableErrors: 0
        };
    }
    
    shouldUseCanary(context = {}) {
        // Sticky sessions - same user always gets same version
        if (context.userId) {
            const hash = this.hashString(context.userId);
            return (hash % 100) < this.canaryPercentage;
        }
        
        // Random distribution
        return Math.random() * 100 < this.canaryPercentage;
    }
    
    processRequest(request, context = {}) {
        const useCanary = this.shouldUseCanary(context);
        
        if (useCanary) {
            this.metrics.canaryRequests++;
            return this.processWithCanary(request);
        } else {
            this.metrics.stableRequests++;
            return this.processWithStable(request);
        }
    }
    
    processWithCanary(request) {
        try {
            // Enhanced algorithm for canary
            const result = request.value * 3;
            return {
                result,
                version: this.canaryVersion,
                algorithm: 'enhanced',
                canary: true
            };
        } catch (error) {
            this.metrics.canaryErrors++;
            throw error;
        }
    }
    
    processWithStable(request) {
        try {
            // Standard algorithm for stable
            const result = request.value * 2;
            return {
                result,
                version: this.stableVersion,
                algorithm: 'standard',
                canary: false
            };
        } catch (error) {
            this.metrics.stableErrors++;
            throw error;
        }
    }
    
    getMetrics() {
        const total = this.metrics.canaryRequests + this.metrics.stableRequests;
        const canaryErrorRate = this.metrics.canaryRequests > 0 
            ? (this.metrics.canaryErrors / this.metrics.canaryRequests) * 100 
            : 0;
        const stableErrorRate = this.metrics.stableRequests > 0 
            ? (this.metrics.stableErrors / this.metrics.stableRequests) * 100 
            : 0;
        
        return {
            ...this.metrics,
            total,
            canaryPercentage: total > 0 ? (this.metrics.canaryRequests / total) * 100 : 0,
            canaryErrorRate,
            stableErrorRate,
            healthScore: this.calculateHealthScore(canaryErrorRate, stableErrorRate)
        };
    }
    
    calculateHealthScore(canaryErrorRate, stableErrorRate) {
        if (canaryErrorRate > stableErrorRate * 2) {
            return 'UNHEALTHY';
        } else if (canaryErrorRate > stableErrorRate * 1.5) {
            return 'WARNING';
        } else {
            return 'HEALTHY';
        }
    }
    
    adjustCanaryPercentage(newPercentage) {
        this.canaryPercentage = Math.max(0, Math.min(100, newPercentage));
    }
    
    promoteCanary() {
        this.stableVersion = this.canaryVersion;
        this.canaryPercentage = 0;
        this.resetMetrics();
    }
    
    rollbackCanary() {
        this.canaryPercentage = 0;
        this.resetMetrics();
    }
    
    resetMetrics() {
        this.metrics = {
            canaryRequests: 0,
            stableRequests: 0,
            canaryErrors: 0,
            stableErrors: 0
        };
    }
    
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
}

class BlueGreenDeployment {
    constructor() {
        this.activeEnvironment = 'blue';
        this.environments = {
            blue: {
                version: 'v1.0.0',
                status: 'active',
                health: 'healthy',
                lastDeployed: new Date()
            },
            green: {
                version: 'v1.0.0',
                status: 'standby',
                health: 'healthy',
                lastDeployed: new Date()
            }
        };
    }
    
    deployToStandby(version) {
        const standbyEnv = this.activeEnvironment === 'blue' ? 'green' : 'blue';
        
        this.environments[standbyEnv] = {
            version,
            status: 'deploying',
            health: 'unknown',
            lastDeployed: new Date()
        };
        
        // Simulate deployment
        setTimeout(() => {
            this.environments[standbyEnv].status = 'ready';
            this.environments[standbyEnv].health = 'healthy';
        }, 1000);
        
        return standbyEnv;
    }
    
    switchTraffic() {
        const currentActive = this.activeEnvironment;
        const newActive = currentActive === 'blue' ? 'green' : 'blue';
        
        if (this.environments[newActive].status !== 'ready') {
            throw new Error('Standby environment is not ready');
        }
        
        this.environments[currentActive].status = 'standby';
        this.environments[newActive].status = 'active';
        this.activeEnvironment = newActive;
        
        return {
            previous: currentActive,
            current: newActive,
            switchedAt: new Date()
        };
    }
    
    rollback() {
        return this.switchTraffic();
    }
    
    getStatus() {
        return {
            activeEnvironment: this.activeEnvironment,
            environments: this.environments
        };
    }
    
    processRequest(request) {
        const activeEnv = this.environments[this.activeEnvironment];
        
        return {
            result: request.value * 2,
            environment: this.activeEnvironment,
            version: activeEnv.version,
            processedAt: new Date()
        };
    }
}

module.exports = { FeatureToggle, CanaryDeployment, BlueGreenDeployment };