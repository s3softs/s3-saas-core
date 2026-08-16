/**
 * entitlementGuard — Subscription Feature & Limit Enforcement Middleware
 * 
 * Used by products to restrict feature access and enforce max limits (e.g. maxUsers, maxStores)
 * based on the active subscription snapshot stored in req.tenantConfig.
 */

/**
 * Require a specific feature flag (e.g. 'ADVANCED_REPORTS', 'API_ACCESS')
 */
function requireFeature(featureKey) {
    return (req, res, next) => {
        const features = req.tenantConfig?.subscription?.features || [];

        // Support Developer / Impersonation bypass
        if (req.user?.role === 'Developer' || req.user?.isImpersonating) {
            return next();
        }

        if (!features.includes(featureKey)) {
            return res.status(403).json({
                success: false,
                message: `Feature '${featureKey}' is not included in your current subscription plan. Please upgrade to access this feature.`,
                code: 'FEATURE_NOT_INCLUDED',
                feature: featureKey
            });
        }

        next();
    };
}

/**
 * Check resource creation limit (e.g. 'maxUsers', 'maxStores')
 * @param {string} limitKey  - Key in subscription.limits (e.g. 'maxUsers')
 * @param {string} modelName - Mongoose model name in tenant DB to count (e.g. 'User')
 */
function checkLimit(limitKey, modelName) {
    return async (req, res, next) => {
        // Support Developer / Impersonation bypass
        if (req.user?.role === 'Developer' || req.user?.isImpersonating) {
            return next();
        }

        const limits = req.tenantConfig?.subscription?.limits || {};
        const maxAllowed = limits[limitKey];

        if (typeof maxAllowed === 'number' && maxAllowed > 0) {
            try {
                const Model = req.db.model(modelName);
                const query = { active: true };
                
                // For SHARED databases, filter by tenantId/shopId
                if (req.tenantConfig?.dbType === 'SHARED') {
                    query.shopId = req.tenantId || req.shopId;
                }

                const currentCount = await Model.countDocuments(query);

                if (currentCount >= maxAllowed) {
                    return res.status(403).json({
                        success: false,
                        message: `Resource limit reached: Your current plan allows maximum ${maxAllowed} ${modelName}(s). You currently have ${currentCount}.`,
                        code: 'LIMIT_EXCEEDED',
                        limitKey,
                        currentCount,
                        maxAllowed
                    });
                }
            } catch (err) {
                console.error(`[ENTITLEMENT_GUARD] ⚠️ Limit check error for ${modelName}:`, err.message);
            }
        }

        next();
    };
}

module.exports = {
    requireFeature,
    checkLimit
};
