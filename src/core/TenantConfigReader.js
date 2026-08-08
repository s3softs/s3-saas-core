const mongoose = require('mongoose');
const masterConnection = require('./masterDb');
const { TENANT_STATUS, SUB_STATUS, DB_TYPES, PLAN_CODES } = require('../constants/saasConstants');

/**
 * TenantConfigReader — Read-only Mongoose Model & DTO Projection for Master DB TenantConfig
 * 
 * Used by tenantResolver, identifyTenant, and products to read tenant & subscription status.
 * Standardized to match Super Admin Control Plane v3.0 Master DB Schema.
 */
const tenantConfigSchema = new mongoose.Schema({
    tenantId:      { type: String, index: true },
    subdomain:     { type: String, index: true },
    domain:        { type: String, default: 's3softs.com' },
    frontend_url:  { type: String },
    frontendUrl:   { type: String }, // support both casings
    tenantName:    { type: String },
    ownerEmail:    { type: String },
    projectCode:   { type: String, index: true },
    dbType:        { type: String, enum: Object.values(DB_TYPES) },
    dbName:        { type: String },
    dbUri:         { type: String },
    status:        { type: String, enum: [...Object.values(TENANT_STATUS), 'INACTIVE'], default: TENANT_STATUS.ACTIVE },
    isFreeTrialUsed: { type: Boolean, default: false },
    isSeeded:      { type: Boolean, default: false },
    isInitialized: { type: Boolean, default: false },
    bootstrapStatus: { type: String, default: 'PENDING' },
    bootstrapError:  { type: String, default: null },

    // ── Full Subscription Matrix (Super Admin v3.0) ──────────────────────────
    subscription: {
        isEnabled:      { type: Boolean, default: true },
        planCode:       { type: String, default: PLAN_CODES.FREE },
        durationKey:    { type: String, default: '15_DAYS' },
        durationMonths: { type: Number, default: 0.5 },
        startDate:      { type: Date },
        expiryDate:     { type: Date },
        graceDays:      { type: Number, default: 7 },
        subStatus:      { type: String, default: SUB_STATUS.ACTIVE, enum: Object.values(SUB_STATUS) },
        features:       [{ type: String }],
        limits: {
            maxUsers:  { type: Number, default: 1 },
            maxStores: { type: Number, default: 1 }
        }
    },

    modules: { type: [String], default: [] },

    // --- 🚀 EXTENDED SAAS CONFIG ---
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
    collection: 'tenantconfigs',
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true
});

// Virtual alias for backward compatibility
tenantConfigSchema.virtual('shopId').get(function () { return this.tenantId; });

/**
 * DTO Projection: Strips out any master database cluster secrets or private credentials
 * before returning config to product controllers / callers.
 */
tenantConfigSchema.methods.toSanitizedDTO = function () {
    const obj = this.toObject ? this.toObject() : { ...this };
    delete obj.__v;
    delete obj.firebase?.privateKey;
    delete obj.cloudinary?.apiSecret;
    return obj;
};

const TenantConfigReader = masterConnection.model('TenantConfig', tenantConfigSchema);

module.exports = TenantConfigReader;
