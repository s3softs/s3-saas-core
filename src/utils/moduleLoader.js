const path = require('path');
const fs = require('fs');

/**
 * moduleLoader — Dynamically loads product modules by projectCode
 * 
 * MODULE CONTRACT (every product must export this):
 * {
 *   name:       string       — matches projectCode in ShopConfig
 *   modelsPath: string       — absolute path to product's models directory
 *   routes:     Array<{path, router}> — product's Express routes
 *   seeder:     { seedTenantDatabase(connection, shopConfig) } — onboarding seeder
 * }
 * 
 * GOVERNANCE RULES:
 *   - Modules are cached after first load (singleton per process)
 *   - Module folder name must match projectCode from ShopConfig
 *   - Use clearModuleCache() only in dev/testing
 */
const loadedModules = new Map();
// Router cache — built once per module, reused per request
const routerCache = new Map();

/**
 * loadModule — load and validate a product module
 * @param {string} projectCode    — e.g. 'med_pos', 'gym_pos'
 * @param {string} modulesBasePath — absolute path to modules root dir
 * @returns {Object} module contract object
 */
function loadModule(projectCode, modulesBasePath) {
    if (!projectCode)    throw new Error('[MODULE_LOADER] projectCode is required');
    if (!modulesBasePath) throw new Error('[MODULE_LOADER] modulesBasePath is required');

    if (loadedModules.has(projectCode)) {
        return loadedModules.get(projectCode);
    }

    const modulePath = path.join(modulesBasePath, projectCode);

    if (!fs.existsSync(modulePath)) {
        throw new Error(
            `[MODULE_LOADER] Module not found: "${projectCode}" at ${modulePath}\n` +
            `Ensure the folder name matches projectCode exactly.`
        );
    }

    const mod = require(modulePath);

    // Validate module contract
    const required = ['name', 'routes', 'modelsPath', 'seeder'];
    for (const field of required) {
        if (mod[field] === undefined || mod[field] === null) {
            throw new Error(`[MODULE_LOADER] Module "${projectCode}" is missing required field: "${field}"`);
        }
    }
    if (!Array.isArray(mod.routes)) {
        throw new Error(`[MODULE_LOADER] Module "${projectCode}" routes must be an Array`);
    }
    if (!fs.existsSync(mod.modelsPath)) {
        throw new Error(`[MODULE_LOADER] Module "${projectCode}" modelsPath does not exist: ${mod.modelsPath}`);
    }
    if (typeof mod.seeder?.seedTenantDatabase !== 'function') {
        throw new Error(`[MODULE_LOADER] Module "${projectCode}" seeder must export seedTenantDatabase()`);
    }

    loadedModules.set(projectCode, mod);
    console.log(`✅ [MODULE_LOADER] Module loaded and cached: ${projectCode}`);
    return mod;
}

/**
 * buildModuleRouter — builds and caches an Express router for a module
 * Called once per module, then cached for all subsequent requests.
 */
function buildModuleRouter(express, mod) {
    if (routerCache.has(mod.name)) {
        return routerCache.get(mod.name);
    }
    const router = express.Router();
    mod.routes.forEach(({ path: routePath, router: routeRouter }) => {
        router.use(routePath, routeRouter);
    });
    routerCache.set(mod.name, router);
    console.log(`✅ [MODULE_LOADER] Router built for module: ${mod.name}`);
    return router;
}

function clearModuleCache(projectCode) {
    if (projectCode) {
        loadedModules.delete(projectCode);
        routerCache.delete(projectCode);
    } else {
        loadedModules.clear();
        routerCache.clear();
    }
}

module.exports = { loadModule, buildModuleRouter, clearModuleCache };
