const jwt = require('jsonwebtoken');

/**
 * verifySystemToken — Strict System RPC Authorization Middleware
 * 
 * Enforces short-lived (60s) System JWTs transmitted via Authorization: Bearer <token>
 * signed with the product's PRODUCT_SECRET.
 * 
 * Used by all product backends for /_internal routes called by Super Admin Control Plane.
 */
function verifySystemToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const secretKey = process.env.PRODUCT_SECRET || process.env.BOOTSTRAP_SECRET;

    if (!secretKey) {
        console.error('❌ [S3-SAAS-CORE] PRODUCT_SECRET is not defined in environment variables.');
        return res.status(500).json({
            success: false,
            message: 'Server misconfiguration: PRODUCT_SECRET not configured.'
        });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(`[SYSTEM_RPC] 🚫 Missing Authorization: Bearer <token> header from IP: ${req.ip}`);
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Missing or malformed System Authorization Bearer token.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, secretKey);

        if (decoded.iss !== 'SUPER_ADMIN_CONTROL_PLANE') {
            console.warn(`[SYSTEM_RPC] 🚫 Rejected token with invalid issuer: ${decoded.iss}`);
            return res.status(403).json({
                success: false,
                message: 'Forbidden: Invalid system token issuer.'
            });
        }

        req.systemToken = decoded;
        return next();

    } catch (err) {
        console.warn(`[SYSTEM_RPC] 🚫 Invalid or expired System JWT: ${err.message}`);
        return res.status(401).json({
            success: false,
            message: `Unauthorized: ${err.message}`
        });
    }
}

module.exports = verifySystemToken;
