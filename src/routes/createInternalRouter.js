const express = require('express');
const verifySystemToken = require('../middleware/verifySystemToken');

/**
 * createInternalRouter — Factory for Super Admin Internal RPC Routes
 * 
 * Usage in any product:
 *   const { createInternalRouter } = require('s3-saas-core');
 *   app.use('/_internal', createInternalRouter({ onBootstrap, onResetPassword, onStatusSync }));
 *   app.use('/api/_internal', createInternalRouter({ onBootstrap, onResetPassword, onStatusSync }));
 * 
 * @param {Object} options
 * @param {Function} options.onBootstrap      - async (payload, req) => result
 * @param {Function} options.onResetPassword  - async (payload, req) => result
 * @param {Function} [options.onStatusSync]   - async (payload, req) => result
 */
function createInternalRouter(options = {}) {
    const router = express.Router();

    // Protect all internal routes with verifySystemToken
    router.use(verifySystemToken);

    // 1. POST /bootstrap-tenant
    router.post('/bootstrap-tenant', async (req, res) => {
        try {
            if (!options.onBootstrap || typeof options.onBootstrap !== 'function') {
                return res.status(501).json({
                    success: false,
                    message: 'Product handler for onBootstrap is not implemented.'
                });
            }

            const result = await options.onBootstrap(req.body, req);
            return res.status(200).json({
                success: true,
                message: result?.message || 'Bootstrap completed successfully.',
                tempPassword: result?.tempPassword || req.body?.owner?.password || null,
                data: result?.data || result
            });

        } catch (err) {
            console.error('[INTERNAL_RPC] ❌ Bootstrap failed:', err.message);
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }
    });

    // 2. POST /reset-owner-password
    router.post('/reset-owner-password', async (req, res) => {
        try {
            if (!options.onResetPassword || typeof options.onResetPassword !== 'function') {
                return res.status(501).json({
                    success: false,
                    message: 'Product handler for onResetPassword is not implemented.'
                });
            }

            const result = await options.onResetPassword(req.body, req);
            return res.status(200).json({
                success: true,
                message: result?.message || 'Owner password reset successfully.',
                data: result
            });

        } catch (err) {
            console.error('[INTERNAL_RPC] ❌ Password reset failed:', err.message);
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }
    });

    // 3. POST /tenant-status (Real-time Status Sync Webhook)
    router.post('/tenant-status', async (req, res) => {
        try {
            if (options.onStatusSync && typeof options.onStatusSync === 'function') {
                await options.onStatusSync(req.body, req);
            }

            const { tenantId, subdomain, status } = req.body || {};
            console.log(`[INTERNAL_RPC] ⚡ Tenant status webhook received for ${subdomain || tenantId}: ${status}`);

            // 🧠 Instant Cache Invalidation: Flush Master DB cache for this tenant immediately
            const { clearTenantCache } = require('../core/tenantResolver');
            if (subdomain) clearTenantCache(subdomain);
            if (tenantId) clearTenantCache(tenantId);

            return res.status(200).json({
                success: true,
                message: `Status synced to ${status}`
            });

        } catch (err) {
            console.error('[INTERNAL_RPC] ⚠️ Tenant status sync warning:', err.message);
            // Webhooks return 200 with error detail to prevent retry storm
            return res.status(200).json({
                success: false,
                message: err.message
            });
        }
    });

    return router;
}

module.exports = createInternalRouter;
