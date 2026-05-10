const { getShopId, getDbType } = require('./tenantContext');

/**
 * tenantPlugin — Enterprise Mongoose Tenant Isolation Plugin
 * 
 * Applied to EVERY tenant model via tenantModel.js factory.
 * Automatically injects and enforces tenantId on all DB operations.
 * 
 * IDENTITY RULE (LOCKED):
 *   DB field name : tenantId  (physical storage key)
 *   Backward compat : shopId virtual alias for legacy code
 *   These are the SAME VALUE. Never use both in queries.
 * 
 * SCHEMA RULE (LOCKED):
 *   Developers MUST NOT define tenantId manually in schemas.
 *   This plugin adds it, indexes it, and enforces it automatically.
 * 
 * COVERED OPERATIONS:
 *   ✅ find, findOne, findOneAndUpdate
 *   ✅ updateMany, updateOne, deleteMany, deleteOne
 *   ✅ countDocuments, distinct, findOneAndDelete
 *   ✅ aggregate (pipeline injection + $lookup protection)
 *   ✅ save/create (validate hook)
 *   ✅ insertMany (bulk insert)
 */
function tenantPlugin(schema) {

    // 1. Add tenantId field — controlled by plugin only
    if (process.env.S3_SAAS_ENFORCE_TENANT_ID !== 'false') {
        schema.add({
            tenantId: { type: String, required: true, index: true }
        });

        // 🛡️ [SaaS] Legacy shopId field — ensures compatibility with old indexes & strict mode
        if (!schema.paths.shopId) {
            schema.add({
                shopId: { type: String }
            });
        }
    }

    const resolveTenantId = (queryOptions) => {
        if (queryOptions?.skipTenantCheck) return null;
        return queryOptions?.tenantId || queryOptions?.shopId || getShopId();
    };

    // 2. Query Guard (Merged into section 7 below)
    const queryHooks = [
        'find', 'findOne', 'findOneAndUpdate', 'updateMany', 'updateOne',
        'deleteMany', 'deleteOne', 'findOneAndDelete', 'countDocuments', 'distinct'
    ];

    // 3. Aggregation Guard
    schema.pre('aggregate', function () {
        const tenantId = resolveTenantId(this.options);
        const dbType = getDbType();
        
        // 🚀 OPTIMIZATION: Skip filter for Dedicated/BYOD (Total isolation already exists)
        if (dbType && dbType !== 'SHARED') return;
        
        // 🚀 OPTIMIZATION: Skip if isolation is disabled
        if (process.env.S3_SAAS_ENFORCE_TENANT_ID === 'false') return;

        if (tenantId) {
            const pipeline = this.pipeline();
            pipeline.unshift({ $match: { tenantId } });
            // Deep $lookup protection
            pipeline.forEach(stage => {
                if (stage.$lookup?.pipeline) {
                    stage.$lookup.pipeline.unshift({ $match: { tenantId } });
                }
            });
        } else if (!this.options?.skipTenantCheck) {
            throw new Error(`[CRITICAL_SECURITY] Aggregation blocked — missing tenantId`);
        }
    });

    // 4. Write Guard (Save/Create)
    schema.pre('validate', async function () {
        if (process.env.S3_SAAS_ENFORCE_TENANT_ID === 'false') return;

        const contextTenantId = getShopId();
        
        if (this.tenantId && contextTenantId && this.tenantId !== contextTenantId) {
            console.warn(`[WRITE_SPOOF_ATTEMPT] Overriding tenantId: ${this.tenantId} → ${contextTenantId}`);
            this.tenantId = contextTenantId;
        }
        if (!this.tenantId && contextTenantId) {
            this.tenantId = contextTenantId;
        }

        // 🛡️ [SaaS] Sync shopId during validation (Required for auto-increment counters)
        if (schema.paths.shopId && this.tenantId) {
            this.shopId = this.tenantId;
        }

        // [NEW] Use schema options or constructor options for flexibility
        const skipCheck = this.schema?.options?.skipTenantCheck || this.constructor?.options?.skipTenantCheck;

        if (!this.tenantId && !skipCheck) {
            console.error(`[TENANTPLUGIN] CRITICAL: Write blocked on ${this.constructor.modelName} — No tenantId in context and skipTenantCheck is false.`);
            throw new Error(`[CRITICAL_SECURITY] Write blocked — missing tenantId. Ensure your request is wrapped in tenant context.`);
        }
    });

    // 5. Bulk Insert Guard
    schema.pre('insertMany', async function (docs, options) {
        if (process.env.S3_SAAS_ENFORCE_TENANT_ID === 'false') return;

        const actualOptions = options || this.options || {};
        if (actualOptions.skipTenantCheck) return;

        // 1. Try to get tenantId from options or context
        let tenantId = resolveTenantId(actualOptions);

        // 2. 🛡️ FALLBACK: If context is lost, extract from the first document (Legacy Support)
        if (!tenantId && docs && docs.length > 0) {
            tenantId = docs[0].tenantId || docs[0].shopId;
        }

        for (const doc of docs) {
            if (doc.tenantId && tenantId && doc.tenantId !== tenantId) doc.tenantId = tenantId;
            if (!doc.tenantId && tenantId) doc.tenantId = tenantId;
            
            // FIX: If schema has real shopId (Medical POS), sync it during bulk insert
            if (schema.paths.shopId) {
                doc.shopId = tenantId;
            }

            if (!doc.tenantId) throw new Error(`[CRITICAL_SECURITY] Bulk insert blocked — missing tenantId`);
        }
    });

    schema.set('toJSON', { virtuals: true });
    schema.set('toObject', { virtuals: true });

    // 7. Query Translator — Automatically map shopId -> tenantId in incoming filters
    schema.pre(queryHooks, function () {
        const query = this.getQuery();
        const dbType = getDbType();

        // 1. Try to resolve tenantId (context/options)
        let tenantId = resolveTenantId(this.options);
        
        // 2. 🛡️ FALLBACK: Extract from query filter if context lost (Legacy Support)
        if (!tenantId) {
            tenantId = query.tenantId || query.shopId;
        }

        // 🚀 OPTIMIZATION: Skip filter for Dedicated/BYOD (Total isolation already exists at DB level)
        if (dbType && dbType !== 'SHARED') {
            // Still sync shopId for legacy indexes if present in query, but don't enforce tenantId filter
            if (tenantId && schema.paths.shopId && process.env.S3_SAAS_ENFORCE_TENANT_ID !== 'false') {
                this.where({ shopId: tenantId });
            }
            return;
        }

        // 🚀 OPTIMIZATION: Skip if isolation is disabled
        if (process.env.S3_SAAS_ENFORCE_TENANT_ID === 'false') return;

        if (tenantId) {
            this.where({ tenantId });
            
            // 🛡️ Sync real shopId filter for indexes (Medical POS support)
            if (schema.paths.shopId) {
                this.where({ shopId: tenantId });
                // If it was passed as null/undefined, override it
                if (query.shopId !== tenantId) query.shopId = tenantId;
            }

            // Strict override — prevent spoofing
            if (query.tenantId && query.tenantId !== tenantId) {
                query.tenantId = tenantId;
            }
        } else if (!this.options?.skipTenantCheck) {
            throw new Error(`[CRITICAL_SECURITY] Operation ${this.op} blocked — no tenantId in context`);
        }
    });

    // 8. Sync Real shopId (Legacy Support)
    // If the schema has a real shopId field, ensure it stays in sync with tenantId during saves
    schema.pre('save', async function () {
        if (schema.paths.shopId && this.tenantId) {
            this.shopId = this.tenantId;
        }
    });
}

module.exports = tenantPlugin;
