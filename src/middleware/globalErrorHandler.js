/**
 * globalErrorHandler — centralized error handling for all products
 * Follows Express 4-argument error handler signature.
 */
function globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const shopId  = req.shopId  || 'UNKNOWN';
    const product = req.productType || 'UNKNOWN';

    console.error(`❌ [${shopId}][${product}] Error:`, err.message);
    if (process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }

    res.status(err.status || 500).json({
        error:     err.message || 'Internal server error',
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

module.exports = globalErrorHandler;
