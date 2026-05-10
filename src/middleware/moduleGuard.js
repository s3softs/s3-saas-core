/**
 * moduleGuard — checks if the tenant has an authorized module before route access
 * 
 * Usage in product routes:
 *   router.use('/analytics', checkModule('REPORTS'), analyticsRoutes);
 * 
 * @param {string} requiredModule — e.g. 'REPORTS', 'INVENTORY', 'CRM'
 */
const checkModule = (requiredModule) => {
    return (req, res, next) => {
        const authorizedModules = req.modules || [];
        if (!authorizedModules.includes(requiredModule)) {
            return res.status(403).json({
                message: `Module Access Denied: ${requiredModule}`,
                error: 'Your subscription does not include this module.',
                code: 'MODULE_NOT_AUTHORIZED'
            });
        }
        next();
    };
};

module.exports = checkModule;
