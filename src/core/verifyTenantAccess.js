const { TENANT_STATUS, SUB_STATUS } = require('../constants/saasConstants');

/**
 * verifyTenantAccess — Centralized Master DB Tenant Account & Subscription Guard
 * 
 * Validates tenant status & subscription metrics against Master DB configuration.
 * Can be called during user login or in identifyTenant pipeline.
 * 
 * @param {Object} tenantConfig - TenantConfig object read from Master DB
 * @returns {{ allowAccess: boolean, inGracePeriod: boolean, subStatus: string, daysLeft: number|null, message?: string }}
 * @throws {Error} Throws 403 error with specific code if account is suspended or subscription locked
 */
function verifyTenantAccess(tenantConfig) {
    if (!tenantConfig) {
        const err = new Error('Organization tenant configuration not found.');
        err.statusCode = 404;
        err.code = 'TENANT_NOT_FOUND';
        throw err;
    }

    // 1. Account Status Enforcement (Managed via Super Admin Panel)
    if (tenantConfig.status === TENANT_STATUS.SUSPENDED || tenantConfig.status === 'INACTIVE') {
        const err = new Error('Client organization account has been suspended by system administrator.');
        err.statusCode = 403;
        err.code = 'TENANT_SUSPENDED';
        throw err;
    }

    // 2. Subscription Expiry & Grace Period Enforcement
    const sub = tenantConfig.subscription || {};
    const now = new Date();
    const expiryDate = sub.expiryDate ? new Date(sub.expiryDate) : null;
    const graceDays = typeof sub.graceDays === 'number' ? sub.graceDays : 7;
    const subStatus = sub.subStatus || SUB_STATUS.ACTIVE;

    // Admin override check
    if (subStatus === SUB_STATUS.SUSPENDED_ADMIN) {
        const err = new Error('Subscription access suspended by administrator.');
        err.statusCode = 403;
        err.code = 'SUBSCRIPTION_SUSPENDED';
        throw err;
    }

    if (expiryDate) {
        const diffMs = expiryDate.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        const graceExpiry = new Date(expiryDate);
        graceExpiry.setDate(graceExpiry.getDate() + graceDays);
        graceExpiry.setHours(23, 59, 59, 999);

        // A) Expired & Grace Period Over -> Hard Lock
        if (now > graceExpiry || subStatus === SUB_STATUS.EXPIRED_LOCKED) {
            const formattedDate = expiryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const err = new Error(`Subscription expired on ${formattedDate}. Grace period has elapsed. Please renew subscription to restore access.`);
            err.statusCode = 403;
            err.code = 'SUBSCRIPTION_EXPIRED_LOCKED';
            err.expiryDate = expiryDate;
            throw err;
        }

        // B) Expired but within Grace Period -> Allow Access with Warning Flag
        if (now > expiryDate || subStatus === SUB_STATUS.IN_GRACE_PERIOD) {
            const graceDaysRemaining = Math.max(0, Math.ceil((graceExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            return {
                allowAccess: true,
                inGracePeriod: true,
                subStatus: SUB_STATUS.IN_GRACE_PERIOD,
                daysLeft,
                graceDaysRemaining,
                message: `Subscription expired. Account is operating in grace period (${graceDaysRemaining} day(s) remaining).`
            };
        }

        // C) Active Subscription
        return {
            allowAccess: true,
            inGracePeriod: false,
            subStatus: SUB_STATUS.ACTIVE,
            daysLeft
        };
    }

    return {
        allowAccess: true,
        inGracePeriod: false,
        subStatus: SUB_STATUS.ACTIVE,
        daysLeft: null
    };
}

module.exports = verifyTenantAccess;
