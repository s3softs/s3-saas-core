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
function createSaaSApp(options = {}) {
    const app = express();

    // ── Standard Middleware ─────────────────────────────────────────────────
    app.use(helmet());
    app.use(express.json({ limit: options.jsonLimit || '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    app.use(morgan('dev'));

    // CORS
    const allowedOrigins = options.corsOrigins || [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:5000'
    ];
    app.use(cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            const isSubdomain = origin.match(/^https?:\/\/[^.]+\.localhost(:\d+)?$/);
            if (allowedOrigins.includes(origin) || isSubdomain) {
                callback(null, true);
            } else {
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
