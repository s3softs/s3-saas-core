/**
 * sanitizeSaaSParams — blocks manual shopId/tenantId injection from clients
 * 
 * Security rule: shopId and tenantId are set ONLY by identifyTenant middleware.
 * Any client attempt to inject these values is stripped and logged.
 */
function sanitizeSaaSParams(req, res, next) {
    const injected = req.query?.shopId || req.query?.tenantId
        || (req.body && (req.body.shopId || req.body.tenantId));

    if (injected) {
        console.warn(
            `[SECURITY_ALERT] Manual shopId/tenantId injection blocked! ` +
            `IP: ${req.ip} | User: ${req.user?._id || 'Anonymous'}`
        );
    }

    if (req.query)  { delete req.query.shopId;  delete req.query.tenantId;  }
    if (req.params) { delete req.params.shopId; delete req.params.tenantId; }
    if (req.body && typeof req.body === 'object') {
        delete req.body.shopId;
        delete req.body.tenantId;
    }

    next();
}

module.exports = sanitizeSaaSParams;
