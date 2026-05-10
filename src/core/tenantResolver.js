const TenantConfigReader = require('./TenantConfigReader');

/**
 * tenantResolver — Resolves TenantConfig from subdomain with 5-min cache
 * 
 * CACHE STRATEGY:
 *   Key: subdomain string
 *   TTL: 5 minutes
 *   Invalidation: call clearTenantCache(subdomain) when TenantConfig changes
 */
const tenantCache = new Map();

async function resolveTenant(subdomain) {
    if (!subdomain) return null;

    const projectCode = process.env.PROJECT_CODE;
    if (!projectCode) {
        console.error('❌ [TENANT_RESOLVER] CRITICAL: PROJECT_CODE not set in .env');
        return null;
    }

    // Cache hit
    if (tenantCache.has(subdomain)) {
        return tenantCache.get(subdomain);
    }

    // Query Master DB — filter by subdomain, status, and projectCode
    const tenantConfig = await TenantConfigReader.findOne({
        subdomain,
        status: 'ACTIVE',
        projectCode: projectCode
    }).lean();

    if (tenantConfig) {
        tenantCache.set(subdomain, tenantConfig);
        setTimeout(() => tenantCache.delete(subdomain), 5 * 60 * 1000);
    }

    return tenantConfig;
}

/**
 * clearTenantCache — call this when a tenant's status or config changes
 * SUPER ADMIN must call this via API after updating TenantConfig
 */
function clearTenantCache(key) {
    if (key) {
        tenantCache.delete(key);
        console.log(`[TENANT_RESOLVER] Cache cleared for: ${key}`);
    } else {
        tenantCache.clear();
        console.log('[TENANT_RESOLVER] Full cache cleared');
    }
}

module.exports = { resolveTenant, clearTenantCache };
