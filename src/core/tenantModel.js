const tenantPlugin = require('./tenantPlugin');

/**
 * tenantModel — Factory for creating tenant-isolated Mongoose models
 * 
 * ENFORCES: every model registered via this factory gets the tenantPlugin.
 * This is the ONLY correct way to register models in this SaaS system.
 * Direct conn.model() calls are banned in product code.
 * 
 * @param {mongoose.Connection} conn    - Active tenant DB connection
 * @param {string}              name    - Model name (e.g., 'Product')
 * @param {mongoose.Schema}     schema  - Model schema (WITHOUT shopId — plugin adds it)
 * @returns {mongoose.Model}
 */
module.exports = function createTenantModel(conn, name, schema) {
    if (!conn)   throw new Error(`[TENANT_MODEL] Connection missing for model: ${name}`);
    if (!schema) throw new Error(`[TENANT_MODEL] Schema missing for model: ${name}`);

    // 🚀 [SaaS Optimization] Skip isolation plugin for DEDICATED/BYOD databases
    // Since these databases are physically isolated, they don't need tenantId binding.
    const dbType = conn.dbType;
    if (dbType && dbType !== 'SHARED') {
        return conn.models[name] || conn.model(name, schema);
    }

    // Apply tenantPlugin ONLY ONCE per schema (for SHARED databases)
    const isPluginApplied = schema.plugins?.some(p => p.fn === tenantPlugin);
    if (!isPluginApplied) {
        schema.plugin(tenantPlugin);
    }

    // Return existing compiled model or compile new one
    return conn.models[name] || conn.model(name, schema);
};
