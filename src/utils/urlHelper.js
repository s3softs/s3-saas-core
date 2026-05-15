/**
 * 🌐 [S3-SAAS-CORE] URL Normalization Utility
 * Standardizes protocols and removes trailing slashes
 */

const normalizeUrl = (url) => {
    if (!url || typeof url !== 'string') return '';

    let normalized = url.trim();

    // 1. Protocol Check (Must have http/https)
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = `https://${normalized}`;
    }

    // 2. Trailing Slash Cleanup
    normalized = normalized.replace(/\/+$/, '');

    return normalized;
};

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
};

module.exports = { normalizeUrl, isValidUrl };
