const { resolveTenant } = require('../core/tenantResolver');
const { getConnection } = require('../core/dbManager');
const { runWithTenant } = require('../core/tenantContext');
const TenantConfigReader = require('../core/TenantConfigReader');
const { normalizeUrl } = require('../utils/urlHelper');

/**
 * identifyTenant — SaaS pipeline orchestrator middleware
 * 
 * Runs on every /api request. Steps:
 *   1. Extract subdomain (or x-tenant-id header)
 *   2. Resolve TenantConfig from Master DB (cached)
 *   3. Check PROJECT_CODE (ensures Medical POS only serves Medical tenants)
 *   4. Get/create tenant DB connection
 *   5. Attach everything to req
 *   6. Activate AsyncLocalStorage context for Mongoose isolation
 *   7. HOOK PATTERN: if (!isSeeded) call options.onTenantInit(req)
 * 
 * @param {Object} options
 * @param {Function} options.onTenantInit — Hook provided by product (e.g. seedOwner, seedCategories)
 */
function identifyTenant(options = {}) {
    return async (req, res, next) => {
        try {
            const host = req.headers.host || '';
            const parts = host.split('.');
            let subdomain = '';

            if (parts.length > 2 || (parts.length === 2 && !host.includes('localhost'))) {
                subdomain = parts[0];
            } else if (parts.length === 2 && host.includes('localhost')) {
                subdomain = parts[0];
            }

            // Priority: explicit header > subdomain
            const explicitTenantId = req.headers['x-tenant-id']
                || req.body?.tenantId
                || req.body?.tenant_id
                || req.query?.tenantId
                || req.query?.tenant_id;

            let tenantConfig;

            if (explicitTenantId || subdomain) {
                tenantConfig = await resolveTenant(explicitTenantId || subdomain);
            }

            if (!tenantConfig) {
                return res.status(404).json({ message: 'Organization not found' });
            }

            // --- 🛡️ PROJECT_CODE FILTER (Option A) ---
            const currentProjectCode = process.env.PROJECT_CODE;
            if (currentProjectCode && tenantConfig.projectCode !== currentProjectCode) {
                return res.status(403).json({
                    message: `Tenant ${subdomain} belongs to ${tenantConfig.projectCode}, not ${currentProjectCode}`
                });
            }

            // --- 🛡️ MASTER DB TENANT ACCOUNT & SUBSCRIPTION GUARD ---
            const verifyTenantAccess = require('../core/verifyTenantAccess');
            let accessInfo;
            try {
                accessInfo = verifyTenantAccess(tenantConfig);
            } catch (accessErr) {
                return res.status(accessErr.statusCode || 403).json({
                    message: accessErr.message,
                    code: accessErr.code
                });
            }

            // 🌐 [PHASE 6 SHADOW MODE]
            // Verify tenant frontend_url resolution from Master DB
            const rawFrontendUrl = tenantConfig.frontend_url || tenantConfig.frontendUrl;
            const resolvedFrontendUrl = normalizeUrl(rawFrontendUrl);

            if (process.env.SAAS_SHADOW_MODE === 'true') {
                console.log(`🔍 [SHADOW_MODE] Tenant: ${tenantConfig.tenantId} | Resolved Frontend: ${resolvedFrontendUrl} | Source: MasterDB`);
            }

            // 🚀 [PHASE 6 CUTOVER]
            // If enforcement is ON, we ensure all downstream logic uses the Master DB URL
            if (process.env.SAAS_ENFORCE_TENANT_URL === 'true') {
                if (!resolvedFrontendUrl) {
                    console.warn(`❌ [SAAS_ENFORCE] Tenant ${tenantConfig.tenantId} has no valid frontend_url in Master DB.`);
                }
            }

            // Get tenant DB connection
            const db = await getConnection(tenantConfig, options.modelsPath);

            // ── Attach to request ─────────────────────────────────────────
            req.shopId = tenantConfig.tenantId;     // backward compat
            req.tenantId = tenantConfig.tenantId;     // forward compat
            req.tenantConfig = tenantConfig;        // Sanitized Master DB config
            req.tenantAccess = accessInfo;          // Subscription & status access metrics
            req.shopConfig = {
                ...tenantConfig,
                shopId: tenantConfig.tenantId,
                frontendUrl: resolvedFrontendUrl // 🌐 Enforced standardized URL
            };
            req.tenant = req.shopConfig;            // alias for controllers
            req.db = db;
            req.productType = tenantConfig.projectCode;
            req.modules = (tenantConfig.modules?.length > 0)
                ? tenantConfig.modules
                : ['POS', 'INVENTORY', 'ACCOUNTING', 'PURCHASE', 'CRM', 'REPORTS', 'ADMIN'];
            req.financialYear = '2026-27'; // Default — can be overridden by route middleware if needed

            if (req.body && !req.body.shopId) req.body.shopId = tenantConfig.tenantId;

            // Super Admin impersonation check
            let isSuperAdmin = false;
            try {
                const token = req.headers.authorization?.split(' ')[1];
                if (token) {
                    const jwt = require('jsonwebtoken');
                    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
                    isSuperAdmin = decoded.role === 'Developer' || decoded.role === 'SuperAdmin';
                }
            } catch (_) { /* ignore invalid tokens */ }

            if (req.user && !isSuperAdmin && req.user.shopId !== req.shopId) {
                return res.status(403).json({ message: 'Unauthorized: Tenant mismatch' });
            }

            // 🔒 WRAP ENTIRE REQUEST IN TENANT CONTEXT (Critical for AsyncLocalStorage isolation)
            // The context must persist through ALL downstream middleware and route handlers
            const { tenantStorage } = require('../core/tenantContext');

            tenantStorage.run({
                tenantId: tenantConfig.tenantId,
                dbType: tenantConfig.dbType
            }, async () => {
                try {
                    // ── THE HOOK PATTERN (Seeding with Atomic Lock) ─────────────────────────
                    if (!tenantConfig.isInitialized && typeof options.onTenantInit === 'function') {
                        // 🔒 ATOMIC LOCK: Try to flip the flag in the Master DB first
                        // Only the request that successfully updates from false -> true will run the seeder
                        const lockAcquired = await TenantConfigReader.findOneAndUpdate(
                            { tenantId: tenantConfig.tenantId, isInitialized: false },
                            { $set: { isInitialized: true } },
                            { new: true }
                        );

                        if (lockAcquired) {
                            try {
                                await options.onTenantInit(req);

                                // Clear cache so future requests see isInitialized: true
                                const { clearTenantCache } = require('../core/tenantResolver');
                                clearTenantCache(subdomain || tenantConfig.tenantId);
                            } catch (seedError) {
                                console.error(`❌ [${tenantConfig.tenantId}] Seeding FAILED:`, seedError.message);
                                throw seedError;
                            }
                        }
                    }

                    // ✅ Call next() INSIDE the context — entire downstream chain inherits it
                    next();
                } catch (err) {
                    console.error(`⚠️ [${tenantConfig.tenantId}] Initialization Hook Failed:`, err.message);
                    next(err);
                }
            });

        } catch (err) {
            console.error('❌ [IDENTIFY_TENANT] Error:', err.message);
            next(err);
        }
    };
}

module.exports = identifyTenant;
