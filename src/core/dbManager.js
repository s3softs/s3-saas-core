const mongoose = require('mongoose');

/**
 * Loaded connections pool: key = dbUri, value = mongoose.Connection
 * 
 * KEY STRATEGY:
 *   SHARED    → key = full URI (all shops of same project share 1 connection)
 *   DEDICATED → key = full URI (unique per shop)
 *   BYOD      → key = full URI (customer's own)
 */
const connections = new Map();

function validateDbUri(uri) {
    if (!uri) throw new Error('[SECURITY] Missing DB URI for this tenant');
    if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
        throw new Error('[SECURITY] Invalid DB URI protocol');
    }
}

/**
 * getConnection — get or create mongoose connection for a shop
 * 
 * @param {Object} shop — shopConfig from Master DB
 * @param {string} [modelsPath] — Optional path to models directory for auto-loading
 * @returns {mongoose.Connection}
 */
async function getConnection(shop, modelsPath) {
    const { dbUri, dbName, dbType, shopId } = shop;

    let finalUri = '';

    if (dbType === 'SHARED') {
        finalUri = dbUri || process.env.SHARED_DB_URI;
        if (!finalUri) throw new Error(`[DB_MANAGER] No SHARED DB URI for ${shopId}`);

    } else if (dbType === 'DEDICATED') {
        if (dbUri) {
            finalUri = dbUri;
        } else if (process.env.DEDICATED_BASE_URI && dbName) {
            const url = new URL(process.env.DEDICATED_BASE_URI);
            finalUri = `${url.protocol}//${url.host}/${dbName}${url.search}`;
        } else if (process.env.SHARED_DB_URI && dbName) {
            const url = new URL(process.env.SHARED_DB_URI);
            finalUri = `${url.protocol}//${url.host}/${dbName}${url.search}`;
        }
        if (!finalUri) throw new Error(`[DB_MANAGER] No DEDICATED DB URI for ${shopId}`);

    } else if (dbType === 'BYOD') {
        validateDbUri(dbUri);
        finalUri = dbUri;
    } else {
        throw new Error(`[DB_MANAGER] Unknown dbType: ${dbType}`);
    }

    const connectionKey = finalUri;
    let connection = connections.get(connectionKey);

    // Evict dead connections
    if (connection && connection.readyState !== 1 && connection.readyState !== 2) {
        connections.delete(connectionKey);
        connection = null;
    }

    if (!connection) {
        connection = mongoose.createConnection(finalUri);
        connection.dbType = dbType; // 🚀 Attach for tenantModel identification
        connections.set(connectionKey, connection);

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error(`[DB_MANAGER] Timeout connecting for ${shopId}`)),
                15000
            );
            if (connection.readyState === 1) {
                clearTimeout(timeout);
                resolve();
            } else {
                connection.once('connected', () => { clearTimeout(timeout); resolve(); });
                connection.once('error', (err) => { clearTimeout(timeout); reject(err); });
            }
        });
    } else if (connection.readyState === 2) {
        // Connecting — wait
        await new Promise(resolve => connection.once('connected', resolve));
    }

    // Auto-load models if a path is provided
    if (modelsPath && !connection.modelsLoaded) {
        const fs = require('fs');
        const path = require('path');
        try {
            const files = fs.readdirSync(modelsPath);
            for (const file of files) {
                if (file.endsWith('.js')) {
                    const factory = require(path.join(modelsPath, file));
                    if (typeof factory === 'function') {
                        factory(connection);
                    } else {
                        console.warn(`   ⚠️  Model ${file} does not export a factory function!`);
                    }
                }
            }
            connection.modelsLoaded = true;
        } catch (e) {
            console.error(`[DB_MANAGER] ❌ Failed to load models from ${modelsPath}: ${e.message}`);
        }
    }

    connection.lastUsed = Date.now();
    return connection;
}

// LRU: evict idle connections (15+ min).
setInterval(async () => {
    const now = Date.now();
    for (const [key, conn] of connections.entries()) {
        const idle = now - (conn.lastUsed || 0);
        if (idle > 15 * 60 * 1000) {
            console.log(`[DB_MANAGER] Evicting idle connection (${Math.round(idle / 60000)}m)`);
            connections.delete(key);
            try { await conn.close(); } catch (_) { /* ignore */ }
        }
    }
}, 5 * 60 * 1000);

module.exports = { getConnection };
