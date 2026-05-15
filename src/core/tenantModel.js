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

    // Apply tenantPlugin ONLY ONCE per schema
    // This ensures tenantId/shopId fields are added for schema consistency (avoids Strict Mode errors)
    // The plugin internally handles dbType checks to skip unnecessary filtering for Dedicated/BYOD.
    const isPluginApplied = schema.plugins?.some(p => p.fn === tenantPlugin);
    if (!isPluginApplied) {
        schema.plugin(tenantPlugin);
    }

    // Return existing compiled model or compile new one
    return conn.models[name] || conn.model(name, schema);
};
