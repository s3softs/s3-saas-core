const express          = require('express');
const cors             = require('cors');
const helmet           = require('helmet');
const morgan           = require('morgan');

const identifyTenant    = require('../middleware/identifyTenant');
const sanitizeSaaSParams = require('../middleware/sanitizeSaaSParams');
const saasRequestLogger  = require('../middleware/saasRequestLogger');
const globalErrorHandler = require('../middleware/globalErrorHandler');

/**
 * createSaaSApp — Factory that builds a fully configured SaaS Express app for Option A
 * 
 * @param {Object}   options
 * @param {Function} [options.onTenantInit]  — Hook triggered for new unseeded tenants
 * @param {string}   [options.modelsPath]    — Absolute path to product's models directory for auto-loading
 * @param {Array}    [options.corsOrigins]   — Array of allowed origins
 * @param {string}   [options.jsonLimit]     — express.json limit (default '50mb')
 * 
 * @returns {{ app: Express, globalErrorHandler: Function }}
 */
function createSaaSApp(options) {
    // 🛡️ [SAAS GUARD] Ensure mandatory configuration is provided
    if (!options) {
        throw new Error("❌ [S3-SAAS-CORE] Missing SaaS config initialization. 'options' is required.");
    }

    if (!options.corsOrigins) {
        throw new Error("❌ [S3-SAAS-CORE] 'corsOrigins' is a REQUIRED configuration. Production backends must not use open CORS.");
    }

    // Fail-fast for critical project context
    if (!process.env.PROJECT_CODE) {
        throw new Error("❌ [S3-SAAS-CORE] CRITICAL: 'PROJECT_CODE' is not defined in .env. Engine cannot resolve tenants without project context.");
    }

    const app = express();

    // ── Standard Middleware ─────────────────────────────────────────────────
    app.use(helmet());
    app.use(express.json({ limit: options.jsonLimit || '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    app.use(morgan('dev'));

    // ── CORS Hardening ──────────────────────────────────────────────────────
    // Normalize origins: split, trim, filter empty, and deduplicate
    let allowedOrigins = [];
    if (options.corsOrigins) {
        if (Array.isArray(options.corsOrigins)) {
            allowedOrigins = options.corsOrigins;
        } else if (typeof options.corsOrigins === 'string') {
            allowedOrigins = options.corsOrigins.split(',').map(o => o.trim()).filter(Boolean);
        }
    }
    allowedOrigins = [...new Set(allowedOrigins)];

    if (allowedOrigins.length === 0) {
        throw new Error("❌ [S3-SAAS-CORE] 'corsOrigins' list is empty. Production backends must specify at least one origin.");
    }

    app.use(cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps, curl, or server-to-server)
            if (!origin) return callback(null, true);

            const isAllowed = allowedOrigins.some(pattern => {
                if (pattern.includes('*')) {
                    // Convert wildcard pattern to Regex
                    // e.g. https://*.s3softs.com -> /^https:\/\/.*\.s3softs\.com$/
                    const regex = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
                    return regex.test(origin);
                }
                return pattern === origin;
            });

            // Fallback for .localhost subdomains (kept for backward compatibility)
            const isLocalhostSubdomain = origin.match(/^https?:\/\/[^.]+\.localhost(:\d+)?$/);

            if (isAllowed || isLocalhostSubdomain) {
                callback(null, true);
            } else {
                console.warn(`⚠️ [CORS] Blocked origin: ${origin}`);
                callback(new Error('CORS not allowed for: ' + origin));
            }
        },
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-auth-token', 'academic-session'],
        credentials: true
    }));

    // ── Health Check (no tenant required) ──────────────────────────────────
    app.get('/health', (req, res) => {
        res.json({ status: 'UP', service: 's3-saas-core', timestamp: new Date().toISOString() });
    });

    // ── SaaS Pipeline ──────────────────────────────────────────────────────
    // Step 1: Block manual shopId/tenantId injection
    app.use('/api', sanitizeSaaSParams);

    // Step 2: Identify tenant, connect DB, load models, trigger hook if needed
    app.use('/api', identifyTenant({ 
        onTenantInit: options.onTenantInit,
        modelsPath: options.modelsPath 
    }));

    // Step 3: Per-tenant request logging
    app.use('/api', saasRequestLogger);

    // Notes:
    // Routes must be attached to the returned `app` object by the product backend.
    // The product backend should also attach the globalErrorHandler at the very end.

    return { app, globalErrorHandler };
}

module.exports = createSaaSApp;
