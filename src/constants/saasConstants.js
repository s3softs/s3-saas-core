/**
 * saasConstants — Universal SaaS Platform Enums & Statuses
 * Matches Super Admin Control Plane v3.0 Master DB definitions
 */

const DB_TYPES = {
    SHARED: 'SHARED',
    DEDICATED: 'DEDICATED',
    BYOD: 'BYOD',
};

const TENANT_STATUS = {
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    INACTIVE: 'INACTIVE',
};

const SUB_STATUS = {
    ACTIVE: 'ACTIVE',
    IN_GRACE_PERIOD: 'IN_GRACE_PERIOD',
    EXPIRED_LOCKED: 'EXPIRED_LOCKED',
    SUSPENDED_ADMIN: 'SUSPENDED_ADMIN',
};

const PLAN_CODES = {
    FREE: 'FREE',
    BASIC: 'BASIC',
    STANDARD: 'STANDARD',
    PREMIUM: 'PREMIUM',
};

const BOOTSTRAP_STATUS = {
    COMPLETED: 'COMPLETED',
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    FAILED: 'FAILED',
};

module.exports = {
    DB_TYPES,
    TENANT_STATUS,
    SUB_STATUS,
    PLAN_CODES,
    BOOTSTRAP_STATUS,
};
