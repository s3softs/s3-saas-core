# 🚀 S3 SaaS Core

**s3-saas-core** is the architectural backbone of the S3 SaaS ecosystem. It provides the essential infrastructure needed to turn any single-tenant Node.js application into a production-ready, multi-tenant SaaS platform.

This library handles the "hard parts" of SaaS: tenant identification, dynamic database connection management, and request isolation.

---

## 🌟 Key Features

### 🏢 Intelligent Tenant Resolution
*   **Subdomain Support:** Automatically identifies tenants from the request URL (e.g., `shop1.localhost`).
*   **Explicit Identification:** Supports `x-tenant-id` headers and request body overrides for API-first integrations.
*   **Project Isolation:** Enforces `PROJECT_CODE` checks to ensure a "Medical POS" server only handles "Medical POS" tenants.

### 🗄️ Dynamic DB Management
*   **Multiple DB Strategies:**
    *   **SHARED:** Multiple tenants sharing a single database.
    *   **DEDICATED:** Each tenant has their own isolated database.
    *   **BYOD (Bring Your Own Database):** External database support for enterprise customers.
*   **Connection Pooling:** Efficiently manages and recycles MongoDB connections with automatic idle eviction (LRU).
*   **Auto Model Loading:** Automatically injects Mongoose models into the tenant's connection pool.

### 🛡️ Secure Context Isolation
*   **AsyncLocalStorage:** Uses Node.js `AsyncLocalStorage` to ensure that data from one tenant never "leaks" into another request.
*   **Sanitization Middleware:** Automatically strips unauthorized tenant ID injections from request bodies to prevent cross-tenant data tampering.

### ⚡ Smart Seeding & Lifecycle
*   **`onTenantInit` Hook:** A powerful hook that runs exactly once when a new tenant signs up, allowing for automatic database seeding (e.g., creating the first admin user, default categories, or settings).
*   **Atomic Locking:** Prevents race conditions during tenant initialization.

---

## 🏗️ Architecture Overview

The library follows a modular design:

1.  **🧠 `core/`**: The engine room. Handles DB connections, master database resolution, and context storage.
2.  **💪 `middleware/`**: The processing pipeline. Identifies tenants, connects databases, and protects routes.
3.  **🚀 `engine/`**: The app factory (`createSaaSApp`) that wraps everything into a pre-configured Express application.

---

## 💻 Quick Start

### Basic Usage

```javascript
const { createSaaSApp } = require('s3-saas-core');
const path = require('path');

const { app, globalErrorHandler } = createSaaSApp({
    modelsPath: path.join(__dirname, 'models'), // Auto-load your models here
    onTenantInit: async (req) => {
        // Run your seeding logic here (e.g., Create Admin User)
        console.log(`Initializing new tenant: ${req.tenantId}`);
    }
});

// Attach your business routes
app.use('/api/sales', require('./routes/sales'));

// Global error handler must be last
app.use(globalErrorHandler);

app.listen(3000, () => console.log('SaaS Product running on port 3000'));
```

---

## 🛠️ Requirements

*   **Node.js**: v16+
*   **MongoDB**: Master Database connection string required in `.env`.
*   **Mongoose**: v6+ (bundled with the core).
