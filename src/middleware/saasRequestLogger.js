/**
 * saasRequestLogger — per-tenant request logging
 * Logs: [shopId][productCode] METHOD /path
 */
function saasRequestLogger(req, res, next) {
    const shopId = req.shopId || 'UNKNOWN_TENANT';
    const product = req.productType || 'UNKNOWN_PRODUCT';
    next();
}

module.exports = saasRequestLogger;
