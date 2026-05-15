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

async function resolveTenant(identifier) {
    if (!identifier) return null;

    const projectCode = process.env.PROJECT_CODE;
    if (!projectCode) {
        console.error('❌ [TENANT_RESOLVER] CRITICAL: PROJECT_CODE not set in .env');
        return null;
    }

    // 🧠 [PERFORMANCE] Cache hit (Key can be subdomain or tenantId)
    if (tenantCache.has(identifier)) {
        return tenantCache.get(identifier);
    }

    // Query Master DB — filter by subdomain OR tenantId, status, and projectCode
    const tenantConfig = await TenantConfigReader.findOne({
        $or: [
            { subdomain: identifier },
            { tenantId: identifier }
        ],
        status: 'ACTIVE',
        projectCode: projectCode
    }).lean();

    if (tenantConfig) {
        // Cache by BOTH keys to ensure future lookups are fast regardless of identifier used
        tenantCache.set(tenantConfig.subdomain, tenantConfig);
        tenantCache.set(tenantConfig.tenantId, tenantConfig);
        
        // 🕒 TTL: 5 minutes
        setTimeout(() => {
            tenantCache.delete(tenantConfig.subdomain);
            tenantCache.delete(tenantConfig.tenantId);
        }, 5 * 60 * 1000);
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
