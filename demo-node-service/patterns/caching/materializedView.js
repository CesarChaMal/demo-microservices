/**
 * Materialized View Pattern Implementation
 * Pre-computed views for complex queries
 */

class MaterializedViewService {
    constructor() {
        this.views = new Map();
        this.refreshIntervals = new Map();
        this.refreshTimers = new Map();
        this.metrics = {
            viewHits: 0,
            refreshes: 0,
            refreshErrors: 0
        };
    }
    
    createView(name, queryFunc, refreshInterval = 300000) {
        this.views.set(name, {
            data: null,
            lastRefresh: 0,
            queryFunc
        });
        this.refreshIntervals.set(name, refreshInterval);
        
        // Initial refresh
        this._refreshView(name);
        
        // Start auto-refresh
        const timer = setInterval(() => this._refreshView(name), refreshInterval);
        this.refreshTimers.set(name, timer);
        
        console.log(`Created materialized view: ${name}`);
    }
    
    getView(name) {
        if (!this.views.has(name)) {
            throw new Error(`View ${name} not found`);
        }
        
        this.metrics.viewHits++;
        return this.views.get(name).data;
    }
    
    async _refreshView(name) {
        try {
            const view = this.views.get(name);
            const newData = await view.queryFunc();
            view.data = newData;
            view.lastRefresh = Date.now();
            this.metrics.refreshes++;
            console.log(`Refreshed materialized view: ${name}`);
        } catch (error) {
            this.metrics.refreshErrors++;
            console.error(`Failed to refresh view ${name}:`, error);
        }
    }
    
    async forceRefresh(name) {
        if (this.views.has(name)) {
            await this._refreshView(name);
        }
    }
    
    deleteView(name) {
        if (this.views.has(name)) {
            this.views.delete(name);
            this.refreshIntervals.delete(name);
            
            const timer = this.refreshTimers.get(name);
            if (timer) {
                clearInterval(timer);
                this.refreshTimers.delete(name);
            }
            
            console.log(`Deleted materialized view: ${name}`);
        }
    }
    
    getMetrics() {
        const viewsInfo = {};
        for (const [name, view] of this.views) {
            viewsInfo[name] = {
                lastRefresh: view.lastRefresh,
                hasData: view.data !== null
            };
        }
        
        return {
            totalViews: this.views.size,
            viewHits: this.metrics.viewHits,
            refreshes: this.metrics.refreshes,
            refreshErrors: this.metrics.refreshErrors,
            views: viewsInfo
        };
    }
    
    shutdown() {
        for (const timer of this.refreshTimers.values()) {
            clearInterval(timer);
        }
        this.refreshTimers.clear();
    }
}

// Global instance
const materializedViewService = new MaterializedViewService();

// Sample query functions
async function sampleUserStats() {
    return {
        totalUsers: 1000,
        activeUsers: 750,
        lastUpdated: Date.now()
    };
}

async function sampleOrderSummary() {
    return {
        totalOrders: 500,
        pendingOrders: 25,
        lastUpdated: Date.now()
    };
}

// Initialize sample views
materializedViewService.createView('userStats', sampleUserStats, 600000);
materializedViewService.createView('orderSummary', sampleOrderSummary, 300000);

module.exports = { MaterializedViewService, materializedViewService };