const mongoose = require('mongoose');
const masterConnection = require('./masterDb');

/**
 * TenantConfigReader — Read-only model for Master DB TenantConfig collection
 * 
 * Used by tenantResolver and identifyTenant to identify tenants.
 * NEVER used to store business data.
 * 
 * FIELD NOTES:
 *   tenantId     — primary tenant identifier
 *   projectCode  — links to Project master (e.g., 'med_pos', 'gym_pos')
 *   modules      — list of authorized features for this tenant
 *   isSeeded     — true after onboarding seeder has run
 */
const tenantConfigSchema = new mongoose.Schema({
    tenantId:      { type: String, index: true },
    subdomain:     { type: String, index: true },
    tenantName:    { type: String },
    projectCode:   { type: String, index: true },  // module loader uses this
    productId:     { type: String },               // backward compat (old docs)
    dbType:        { type: String },               // SHARED | DEDICATED | BYOD
    dbName:        { type: String },
    dbUri:         { type: String },
    status:        { type: String },               // ACTIVE | INACTIVE | SUSPENDED
    isSeeded:      { type: Boolean, default: false },
    isInitialized: { type: Boolean, default: false }, // SaaS hook trigger
    modules:       { type: [String], default: [] },
    frontend_url:  { type: String },
    frontendUrl:   { type: String }, // support both casings
    subscription: {
        isEnabled: Boolean,
        isExpired:  Boolean
    },
    // --- 🚀 EXTENDED SAAS CONFIG (Option A Reusability) ---
    branding: {
        schoolName:     String,
        logo:           String,
        favicon:        String,
        address:        String,
        theme: {
            primaryColor:   String,
            secondaryColor: String
        }
    },
    company: {
        name:           String,
        developerUrl:   String,
        supportEmail:   String
    },
    firebase: {
        apiKey:            String,
        authDomain:        String,
        projectId:         String,
        storageBucket:     String,
        messagingSenderId: String,
        appId:             String,
        measurementId:     String,
        clientEmail:       String,
        privateKey:        String
    },
    cloudinary: {
        cloudName: String,
        apiKey:    String,
        apiSecret: String
    },
    gemini: {
        apiKey: String
    }
}, {
    collection: 'tenantconfigs',  // must match Master DB collection name
    toJSON:   { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual alias for backward compatibility
tenantConfigSchema.virtual('shopId').get(function () { return this.tenantId; });

const TenantConfigReader = masterConnection.model('TenantConfig', tenantConfigSchema);

module.exports = TenantConfigReader;
