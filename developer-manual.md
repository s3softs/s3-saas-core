# 📘 Developer Manual: Integrating s3-saas-core

This manual provides technical instructions on how to integrate and use **s3-saas-core** within an S3 product like Medical POS.

---

## ⚙️ Environment Configuration

Before starting, ensure your `.env` file contains the following core variables:

```env
# Master DB (Stores tenant configurations)
MASTER_DB_URI=mongodb://localhost:27017/s3_master

# Project Identity
PROJECT_CODE=med_pos

# Default DB Connection for SHARED tenants
SHARED_DB_URI=mongodb://localhost:27017/s3_med_pos_shared

# Connection Settings
JWT_SECRET=your_secret_key
```

---

## 🚀 Integration Steps

### 1. The App Factory (`createSaaSApp`)
In your main entry point (e.g., `app.js` or `server.js`), use the `createSaaSApp` factory. It pre-configures Helmet, CORS, Body-parser, and the entire SaaS identification pipeline.

```javascript
const { createSaaSApp } = require('s3-saas-core');
const path = require('path');

const { app, globalErrorHandler } = createSaaSApp({
    modelsPath: path.join(__dirname, 'src/models'), // 📂 Automatic model loading
    onTenantInit: require('./src/utils/seeder'),    // 🌱 One-time seeding hook
    corsOrigins: ['http://my-frontend.com']         // 🌐 Allowed origins
});
```

### 2. Model Factory Pattern
To work with **s3-saas-core**, your Mongoose models **MUST** follow the factory pattern. Instead of `mongoose.model()`, export a function that accepts a connection.

**Incorrect (Single Tenant):**
```javascript
const mongoose = require('mongoose');
module.exports = mongoose.model('Sale', saleSchema);
```

**Correct (Multi-Tenant):**
```javascript
module.exports = (connection) => {
    if (connection.models.Sale) return connection.models.Sale; // Prevent re-definition
    return connection.model('Sale', saleSchema);
};
```

### 3. Accessing the Tenant Database
Once the `identifyTenant` middleware runs, it attaches the resolved database connection to `req.db`. **NEVER** use the global `mongoose` object in your controllers.

```javascript
// backend/src/controllers/saleController.js

exports.getSales = async (req, res) => {
    // 1. Get the model from the tenant's connection
    const Sale = req.db.model('Sale');
    
    // 2. Query only the tenant's data
    const sales = await Sale.find({ shopId: req.tenantId });
    
    res.json(sales);
};
```

---

## 🏗️ Core Middleware Pipeline

Every request to `/api` goes through these steps:

1.  **`identifyTenant`**:
    *   Finds `tenantId` (from subdomain or header).
    *   Connects to the correct MongoDB (Shared/Dedicated/BYOD).
    *   Loads all models from `modelsPath`.
    *   Attaches `req.db`, `req.tenantId`, and `req.shopConfig`.
2.  **`sanitizeSaaSParams`**: Prevents malicious users from manually injecting a different `shopId` into the request body.
3.  **`saasRequestLogger`**: Logs every request prefixed with the Tenant ID for easier debugging.

---

## 🌱 The `onTenantInit` Hook

This hook is triggered the very first time a tenant makes an API request. It is the perfect place to:
*   Create the default admin user.
*   Set up default business settings (Currency, Tax rates).
*   Add initial categories or units.

**Example Seeder:**
```javascript
// src/utils/seeder.js
module.exports = async (req) => {
    const User = req.db.model('User');
    const existing = await User.findOne({ role: 'Admin' });
    
    if (!existing) {
        await User.create({
            username: 'admin',
            password: 'hashed_password',
            role: 'Admin',
            shopId: req.tenantId
        });
    }
};
```

---

## 🛡️ Best Practices

1.  **Isolation:** Always use `req.db.model('Name')` inside controllers.
2.  **Idempotency:** When seeding data in `onTenantInit`, always check if the data already exists before creating it.
3.  **Filenames:** Ensure model factory files in your `modelsPath` end in `.js`.
4.  **ShopId Filtering:** Even though DBs are isolated, always include `shopId: req.tenantId` in your queries for an extra layer of security and future-proofing.
