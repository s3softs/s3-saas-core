const { AsyncLocalStorage } = require('async_hooks');

/**
 * tenantContext — AsyncLocalStorage based tenant isolation
 * 
 * Carries tenantId through the entire async call chain.
 * This is what allows tenantPlugin to auto-inject tenantId into
 * every Mongoose operation WITHOUT needing req.db or req.tenantId.
 * 
 * IDENTITY RULE:
 *   tenantId (stored value) == shopId (legacy name)
 */
const tenantStorage = new AsyncLocalStorage();

module.exports = {
    tenantStorage,

    /**
     * runWithTenant — wraps a callback in a tenant context
     * @param {Object} config — { tenantId, dbType }
     * @param {Function} callback — async function to run in context
     */
    runWithTenant: (config, callback) => {
        // config can be a string (legacy) or an object { tenantId, dbType }
        const storeValue = typeof config === 'string' ? { tenantId: config } : config;
        return tenantStorage.run(storeValue, callback);
    },

    /**
     * getTenantId — returns current tenantId from context
     */
    getTenantId: () => {
        const store = tenantStorage.getStore();
        return store ? store.tenantId : null;
    },

    /**
     * getDbType — returns current database type from context
     */
    getDbType: () => {
        const store = tenantStorage.getStore();
        return store ? store.dbType : null;
    },

    // Backward compatibility alias
    getShopId: () => {
        const store = tenantStorage.getStore();
        return store ? store.tenantId : null;
    }
};
