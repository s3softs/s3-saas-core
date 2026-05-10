const mongoose = require('mongoose');

/**
 * masterDb — Singleton read-only connection to the Control Plane (Master DB)
 * 
 * RULES:
 * - Used ONLY for ShopConfig resolution (tenant identification)
 * - NEVER used to store business data
 * - Connection is created ONCE at app startup
 */
const masterConnection = mongoose.createConnection(process.env.MASTER_DB_URI);

masterConnection.on('connected', () => {
    console.log('✅ [s3-saas-core] Connected to MASTER DB (Control Plane)');
});

masterConnection.on('error', (err) => {
    console.error('❌ [s3-saas-core] MASTER DB Connection Error:', err.message);
});

masterConnection.on('disconnected', () => {
    console.warn('⚠️  [s3-saas-core] MASTER DB Disconnected');
});

module.exports = masterConnection;
