const crypto = require('crypto');

/**
 * Hierarchical Key Derivation System
 * Issue #922: HKDF-based deterministic key derivation with multi-level hierarchy
 *
 * Implements hierarchical key derivation: Master → Tenant → User → Resource
 * Uses HKDF (RFC 5869) for cryptographically secure key derivation
 */
class HierarchicalKeyDerivation {
    constructor() {
        this.hashAlgorithm = 'sha256'; // HKDF default
        this.defaultKeyLength = 32; // 256 bits for AES-256
        this.maxKeyLength = 8160; // HKDF limit for SHA-256
    }

    /**
     * HKDF Extract phase: Extract pseudorandom key from input keying material
     */
    hkdfExtract(ikm, salt = null) {
        // If no salt provided, use a zero-filled buffer of hash length
        const saltBuffer = salt ? Buffer.from(salt, 'utf8') : Buffer.alloc(32, 0);

        // HMAC with salt as key, IKM as message
        const hmac = crypto.createHmac(this.hashAlgorithm, saltBuffer);
        hmac.update(Buffer.isBuffer(ikm) ? ikm : Buffer.from(ikm, 'utf8'));
        return hmac.digest();
    }

    /**
     * HKDF Expand phase: Expand pseudorandom key to desired length
     */
    hkdfExpand(prk, info, length) {
        if (length > this.maxKeyLength) {
            throw new Error(`Requested key length ${length} exceeds HKDF maximum of ${this.maxKeyLength}`);
        }

        const infoBuffer = Buffer.from(info, 'utf8');
        const hashLength = crypto.createHash(this.hashAlgorithm).digest().length;
        const n = Math.ceil(length / hashLength);

        let t = Buffer.alloc(0);
        let okm = Buffer.alloc(0);

        for (let i = 1; i <= n; i++) {
            const hmac = crypto.createHmac(this.hashAlgorithm, prk);
            hmac.update(t);
            hmac.update(infoBuffer);
            hmac.update(Buffer.from([i]));
            t = hmac.digest();
            okm = Buffer.concat([okm, t]);
        }

        return okm.slice(0, length);
    }

    /**
     * Full HKDF: Extract + Expand
     */
    hkdf(ikm, salt, info, length = this.defaultKeyLength) {
        const prk = this.hkdfExtract(ikm, salt);
        return this.hkdfExpand(prk, info, length);
    }

    /**
     * Generate context-aware salt for hierarchical derivation
     */
    generateContextSalt(context, version = 1) {
        const contextString = typeof context === 'object' ?
            JSON.stringify(context) : String(context);
        const versionedContext = `${contextString}|v${version}`;
        return crypto.createHash(this.hashAlgorithm).update(versionedContext).digest();
    }

    /**
     * Derive tenant key from master key
     * Master → Tenant
     */
    deriveTenantKey(masterKey, tenantId, options = {}) {
        const version = options.version || 1;
        const context = {
            level: 'tenant',
            tenantId: tenantId,
            domain: options.domain || 'default'
        };

        const salt = this.generateContextSalt(context, version);
        const info = `tenant-key-derivation-${tenantId}-v${version}`;

        return this.hkdf(masterKey, salt, info, this.defaultKeyLength);
    }

    /**
     * Derive user key from tenant key
     * Tenant → User
     */
    deriveUserKey(tenantKey, userId, options = {}) {
        const version = options.version || 1;
        const context = {
            level: 'user',
            userId: userId,
            tenantId: options.tenantId,
            userType: options.userType || 'regular'
        };

        const salt = this.generateContextSalt(context, version);
        const info = `user-key-derivation-${userId}-v${version}`;

        return this.hkdf(tenantKey, salt, info, this.defaultKeyLength);
    }

    /**
     * Derive resource key from user key
     * User → Resource
     */
    deriveResourceKey(userKey, resourceId, options = {}) {
        const version = options.version || 1;
        const context = {
            level: 'resource',
            resourceId: resourceId,
            resourceType: options.resourceType || 'data',
            permissions: options.permissions || ['read', 'write']
        };

        const salt = this.generateContextSalt(context, version);
        const info = `resource-key-derivation-${resourceId}-v${version}`;

        return this.hkdf(userKey, salt, info, this.defaultKeyLength);
    }

    /**
     * Derive session key from user key
     * User → Session (for temporary access)
     */
    deriveSessionKey(userKey, sessionId, options = {}) {
        const version = options.version || 1;
        const context = {
            level: 'session',
            sessionId: sessionId,
            expiresAt: options.expiresAt,
            ipAddress: options.ipAddress
        };

        const salt = this.generateContextSalt(context, version);
        const info = `session-key-derivation-${sessionId}-v${version}`;

        return this.hkdf(userKey, salt, info, this.defaultKeyLength);
    }

    /**
     * Full hierarchical derivation: Master → Tenant → User → Resource
     */
    deriveHierarchicalKey(masterKey, hierarchy, options = {}) {
        const { tenantId, userId, resourceId } = hierarchy;

        if (!tenantId || !userId || !resourceId) {
            throw new Error('Hierarchy must include tenantId, userId, and resourceId');
        }

        // Master → Tenant
        const tenantKey = this.deriveTenantKey(masterKey, tenantId, {
            version: options.tenantVersion || 1,
            domain: options.domain
        });

        // Tenant → User
        const userKey = this.deriveUserKey(tenantKey, userId, {
            version: options.userVersion || 1,
            tenantId,
            userType: options.userType
        });

        // User → Resource
        const resourceKey = this.deriveResourceKey(userKey, resourceId, {
            version: options.resourceVersion || 1,
            resourceType: options.resourceType,
            permissions: options.permissions
        });

        // Zeroize intermediate keys for security
        this.zeroizeBuffer(tenantKey);
        this.zeroizeBuffer(userKey);

        return resourceKey;
    }

    /**
     * Verify that same inputs produce same derived key (deterministic property)
     */
    verifyDeterministicDerivation(masterKey, hierarchy, options = {}) {
        const key1 = this.deriveHierarchicalKey(masterKey, hierarchy, options);
        const key2 = this.deriveHierarchicalKey(masterKey, hierarchy, options);

        const isDeterministic = key1.equals(key2);

        // Zeroize for security
        this.zeroizeBuffer(key1);
        this.zeroizeBuffer(key2);

        return isDeterministic;
    }

    /**
     * Verify that different contexts produce different keys
     */
    verifyKeyUniqueness(masterKey) {
        const hierarchy1 = { tenantId: 'tenant1', userId: 'user1', resourceId: 'resource1' };
        const hierarchy2 = { tenantId: 'tenant2', userId: 'user1', resourceId: 'resource1' };
        const hierarchy3 = { tenantId: 'tenant1', userId: 'user2', resourceId: 'resource1' };
        const hierarchy4 = { tenantId: 'tenant1', userId: 'user1', resourceId: 'resource2' };

        const key1 = this.deriveHierarchicalKey(masterKey, hierarchy1);
        const key2 = this.deriveHierarchicalKey(masterKey, hierarchy2);
        const key3 = this.deriveHierarchicalKey(masterKey, hierarchy3);
        const key4 = this.deriveHierarchicalKey(masterKey, hierarchy4);

        const tenantUnique = !key1.equals(key2);
        const userUnique = !key1.equals(key3);
        const resourceUnique = !key1.equals(key4);

        // Zeroize for security
        this.zeroizeBuffer(key1);
        this.zeroizeBuffer(key2);
        this.zeroizeBuffer(key3);
        this.zeroizeBuffer(key4);

        return {
            tenantUniqueness: tenantUnique,
            userUniqueness: userUnique,
            resourceUniqueness: resourceUnique,
            allUnique: tenantUnique && userUnique && resourceUnique
        };
    }

    /**
     * Zeroize a buffer to prevent memory leaks
     */
    zeroizeBuffer(buffer) {
        if (buffer && buffer.length > 0) {
            for (let i = 0; i < buffer.length; i++) {
                buffer[i] = 0;
            }
        }
    }

    /**
     * Performance benchmark for key derivation operations
     */
    async benchmarkDerivation(iterations = 1000) {
        const masterKey = crypto.randomBytes(32);
        const hierarchy = {
            tenantId: 'benchmark-tenant',
            userId: 'benchmark-user',
            resourceId: 'benchmark-resource'
        };

        console.log(`Running HKDF hierarchical derivation benchmark (${iterations} iterations)...`);

        // Benchmark individual operations
        const detailedTimes = {};

        // HKDF Extract benchmark
        let extractTime = 0;
        for (let i = 0; i < iterations; i++) {
            const start = process.hrtime.bigint();
            this.hkdfExtract(masterKey, Buffer.from('salt'));
            const end = process.hrtime.bigint();
            extractTime += Number(end - start);
        }
        detailedTimes.hkdfExtract = (extractTime / iterations) / 1000; // Convert to microseconds

        // HKDF Expand benchmark
        let expandTime = 0;
        const prk = this.hkdfExtract(masterKey, Buffer.from('salt'));
        for (let i = 0; i < iterations; i++) {
            const start = process.hrtime.bigint();
            this.hkdfExpand(prk, Buffer.from('info'), 32);
            const end = process.hrtime.bigint();
            expandTime += Number(end - start);
        }
        detailedTimes.hkdfExpand = (expandTime / iterations) / 1000;

        // Tenant derivation benchmark
        let tenantTime = 0;
        for (let i = 0; i < iterations; i++) {
            const start = process.hrtime.bigint();
            const key = this.deriveTenantKey(masterKey, 'benchmark-tenant');
            const end = process.hrtime.bigint();
            tenantTime += Number(end - start);
            this.zeroizeBuffer(key);
        }
        detailedTimes.tenantDerivation = (tenantTime / iterations) / 1000;

        // User derivation benchmark
        let userTime = 0;
        const tenantKey = this.deriveTenantKey(masterKey, 'benchmark-tenant');
        for (let i = 0; i < iterations; i++) {
            const start = process.hrtime.bigint();
            const key = this.deriveUserKey(tenantKey, 'benchmark-user');
            const end = process.hrtime.bigint();
            userTime += Number(end - start);
            this.zeroizeBuffer(key);
        }
        detailedTimes.userDerivation = (userTime / iterations) / 1000;

        // Resource derivation benchmark
        let resourceTime = 0;
        const userKey = this.deriveUserKey(tenantKey, 'benchmark-user');
        for (let i = 0; i < iterations; i++) {
            const start = process.hrtime.bigint();
            const key = this.deriveResourceKey(userKey, 'benchmark-resource');
            const end = process.hrtime.bigint();
            resourceTime += Number(end - start);
            this.zeroizeBuffer(key);
        }
        detailedTimes.resourceDerivation = (resourceTime / iterations) / 1000;

        // Full hierarchy benchmark
        const startTime = process.hrtime.bigint();
        for (let i = 0; i < iterations; i++) {
            const key = this.deriveHierarchicalKey(masterKey, hierarchy);
            this.zeroizeBuffer(key);
        }
        const endTime = process.hrtime.bigint();
        const totalTimeMs = Number(endTime - startTime) / 1_000_000;
        const avgTimePerDerivation = totalTimeMs / iterations;

        const results = {
            iterations,
            totalTime: totalTimeMs,
            averageTime: avgTimePerDerivation,
            derivationsPerSecond: 1000 / avgTimePerDerivation,
            detailed: detailedTimes,
            timestamp: new Date().toISOString()
        };

        console.log(`Benchmark Results:`);
        console.log(`  Total time: ${totalTimeMs.toFixed(2)}ms`);
        console.log(`  Average per derivation: ${avgTimePerDerivation.toFixed(4)}ms`);
        console.log(`  Derivations per second: ${results.derivationsPerSecond.toFixed(2)}`);

        return results;
    }
}

// Legacy KeyDerivation class for backward compatibility
class KeyDerivation {
    static getMasterKey() {
        // Try to get master key from Master Key Service first
        try {
            const MasterKeyService = require('../services/masterKeyService');
            const masterKeyService = new MasterKeyService();

            // Get active encryption master key
            const masterKey = masterKeyService.retrieveMasterKey('mk-encryption-active', {
                serviceAccount: 'key-derivation-service'
            });

            if (masterKey) {
                return masterKey;
            }
        } catch (error) {
            // Fall back to environment variable if Master Key Service not available
            console.warn('Master Key Service not available, falling back to environment variable');
        }

        // Fallback to environment variable (less secure, for backward compatibility)
        const masterSecret = process.env.ENCRYPTION_MASTER_KEY || 'default-insecure-master-key-must-change-in-prod';

        // Ensure the key is exactly 32 bytes (256 bits) for AES-256
        return crypto.pbkdf2Sync(masterSecret, 'expenseflow-salt', 100000, 32, 'sha512');
    }

    /**
     * Generate a new random AES-256 key for a tenant
     */
    static generateTenantKey() {
        return crypto.randomBytes(32);
    }

    /**
     * Derive a key from a master key and context (legacy method)
     */
    static deriveFromMaster(masterKey, context, length = 32) {
        const contextBuffer = Buffer.from(context, 'utf8');
        const hmac = crypto.createHmac('sha512', masterKey);
        hmac.update(contextBuffer);
        return hmac.digest().slice(0, length);
    }

    /**
     * Derive a tenant-specific key from master key (legacy method)
     */
    static deriveTenantKey(masterKey, tenantId) {
        return this.deriveFromMaster(masterKey, `tenant-${tenantId}`, 32);
    }

    /**
     * Derive a user-specific key from master key (legacy method)
     */
    static deriveUserKey(masterKey, userId) {
        return this.deriveFromMaster(masterKey, `user-${userId}`, 32);
    }
}

module.exports = {
    HierarchicalKeyDerivation,
    KeyDerivation
};
