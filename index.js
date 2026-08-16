/**
 * s3-saas-core — Main Export
 * 
 * Usage in any product:
 *   const { createSaaSApp } = require('s3-saas-core');
 */

module.exports = {
  createSaaSApp:        require('./src/engine/createSaaSApp'),
  createInternalRouter: require('./src/routes/createInternalRouter'),
  verifyTenantAccess:   require('./src/core/verifyTenantAccess'),
  constants:            require('./src/constants/saasConstants'),
  // Core utilities (for advanced use)
  dbManager:            require('./src/core/dbManager'),
  tenantResolver:       require('./src/core/tenantResolver'),
  tenantContext:        require('./src/core/tenantContext'),
  tenantModel:          require('./src/core/tenantModel'),
  TenantConfigReader:   require('./src/core/TenantConfigReader'),
  // Export Mongoose instance to prevent version mismatch in products
  mongoose:             require('mongoose'),
  // Middleware (for custom setups)
  middleware: {
    identifyTenant:     require('./src/middleware/identifyTenant'),
    sanitizeSaaSParams: require('./src/middleware/sanitizeSaaSParams'),
    moduleGuard:        require('./src/middleware/moduleGuard'),
    globalErrorHandler: require('./src/middleware/globalErrorHandler'),
    verifySystemToken:  require('./src/middleware/verifySystemToken'),
    supportAuthGuard:   require('./src/middleware/supportAuthGuard'),
    entitlementGuard:   require('./src/middleware/entitlementGuard'),
  }
};


