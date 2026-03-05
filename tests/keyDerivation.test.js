/**
 * Hierarchical Key Derivation System Test Suite
 * Issue #922: Unit tests for HKDF-based hierarchical key derivation
 */

const assert = require('assert');
const crypto = require('crypto');
const { HierarchicalKeyDerivation, KeyDerivation } = require('../utils/keyDerivation');

describe('Hierarchical Key Derivation System (#922)', () => {
    let hkdf;
    let masterKey;

    beforeEach(() => {
        hkdf = new HierarchicalKeyDerivation();
        masterKey = crypto.randomBytes(32); // 256-bit master key
    });

    describe('HKDF Implementation', () => {
        it('should implement HKDF Extract phase correctly', () => {
            const ikm = Buffer.from('test-input-key-material');
            const salt = Buffer.from('test-salt');

            const prk = hkdf.hkdfExtract(ikm, salt);

            // PRK should be 32 bytes (SHA-256 output length)
            assert.strictEqual(prk.length, 32);
            assert(Buffer.isBuffer(prk));

            // Same inputs should produce same PRK (deterministic)
            const prk2 = hkdf.hkdfExtract(ikm, salt);
            assert(prk.equals(prk2));
        });

        it('should implement HKDF Expand phase correctly', () => {
            const prk = crypto.randomBytes(32);
            const info = 'test-info-string';
            const length = 32;

            const okm = hkdf.hkdfExpand(prk, info, length);

            assert.strictEqual(okm.length, length);
            assert(Buffer.isBuffer(okm));
        });

        it('should implement full HKDF correctly', () => {
            const ikm = Buffer.from('test-ikm');
            const salt = Buffer.from('test-salt');
            const info = 'test-info';
            const length = 32;

            const key = hkdf.hkdf(ikm, salt, info, length);

            assert.strictEqual(key.length, length);
            assert(Buffer.isBuffer(key));

            // Same inputs should produce same key (deterministic)
            const key2 = hkdf.hkdf(ikm, salt, info, length);
            assert(key.equals(key2));
        });

        it('should reject key lengths exceeding HKDF maximum', () => {
            const prk = crypto.randomBytes(32);
            const info = 'test-info';

            assert.throws(() => {
                hkdf.hkdfExpand(prk, info, 9000); // Exceeds max
            }, /exceeds HKDF maximum/);
        });
    });

    describe('Context-Aware Salt Generation', () => {
        it('should generate deterministic salts from context', () => {
            const context1 = { level: 'tenant', tenantId: 'tenant1' };
            const context2 = { level: 'tenant', tenantId: 'tenant1' };
            const context3 = { level: 'tenant', tenantId: 'tenant2' };

            const salt1 = hkdf.generateContextSalt(context1, 1);
            const salt2 = hkdf.generateContextSalt(context2, 1);
            const salt3 = hkdf.generateContextSalt(context3, 1);

            // Same context should produce same salt
            assert(salt1.equals(salt2));

            // Different context should produce different salt
            assert(!salt1.equals(salt3));

            assert.strictEqual(salt1.length, 32); // SHA-256 hash length
        });

        it('should include version in salt generation', () => {
            const context = { level: 'tenant', tenantId: 'tenant1' };

            const salt1 = hkdf.generateContextSalt(context, 1);
            const salt2 = hkdf.generateContextSalt(context, 2);

            // Different versions should produce different salts
            assert(!salt1.equals(salt2));
        });
    });

    describe('Hierarchical Key Derivation', () => {
        it('should derive tenant key from master key', () => {
            const tenantId = 'tenant-123';
            const tenantKey = hkdf.deriveTenantKey(masterKey, tenantId);

            assert.strictEqual(tenantKey.length, 32);
            assert(Buffer.isBuffer(tenantKey));

            // Same inputs should produce same key (deterministic)
            const tenantKey2 = hkdf.deriveTenantKey(masterKey, tenantId);
            assert(tenantKey.equals(tenantKey2));

            // Different tenant should produce different key
            const tenantKey3 = hkdf.deriveTenantKey(masterKey, 'different-tenant');
            assert(!tenantKey.equals(tenantKey3));
        });

        it('should derive user key from tenant key', () => {
            const tenantKey = hkdf.deriveTenantKey(masterKey, 'tenant-123');
            const userId = 'user-456';

            const userKey = hkdf.deriveUserKey(tenantKey, userId);

            assert.strictEqual(userKey.length, 32);
            assert(Buffer.isBuffer(userKey));

            // Same inputs should produce same key
            const userKey2 = hkdf.deriveUserKey(tenantKey, userId);
            assert(userKey.equals(userKey2));

            // Different user should produce different key
            const userKey3 = hkdf.deriveUserKey(tenantKey, 'different-user');
            assert(!userKey.equals(userKey3));
        });

        it('should derive resource key from user key', () => {
            const tenantKey = hkdf.deriveTenantKey(masterKey, 'tenant-123');
            const userKey = hkdf.deriveUserKey(tenantKey, 'user-456');
            const resourceId = 'resource-789';

            const resourceKey = hkdf.deriveResourceKey(userKey, resourceId);

            assert.strictEqual(resourceKey.length, 32);
            assert(Buffer.isBuffer(resourceKey));

            // Same inputs should produce same key
            const resourceKey2 = hkdf.deriveResourceKey(userKey, resourceId);
            assert(resourceKey.equals(resourceKey2));

            // Different resource should produce different key
            const resourceKey3 = hkdf.deriveResourceKey(userKey, 'different-resource');
            assert(!resourceKey.equals(resourceKey3));
        });

        it('should derive session key from user key', () => {
            const tenantKey = hkdf.deriveTenantKey(masterKey, 'tenant-123');
            const userKey = hkdf.deriveUserKey(tenantKey, 'user-456');
            const sessionId = 'session-abc';

            const sessionKey = hkdf.deriveSessionKey(userKey, sessionId);

            assert.strictEqual(sessionKey.length, 32);
            assert(Buffer.isBuffer(sessionKey));

            // Same inputs should produce same key
            const sessionKey2 = hkdf.deriveSessionKey(userKey, sessionId);
            assert(sessionKey.equals(sessionKey2));
        });
    });

    describe('Full Hierarchical Derivation', () => {
        it('should perform Master → Tenant → User → Resource derivation', () => {
            const hierarchy = {
                tenantId: 'tenant-123',
                userId: 'user-456',
                resourceId: 'resource-789'
            };

            const resourceKey = hkdf.deriveHierarchicalKey(masterKey, hierarchy);

            assert.strictEqual(resourceKey.length, 32);
            assert(Buffer.isBuffer(resourceKey));
        });

        it('should ensure deterministic derivation', () => {
            const hierarchy = {
                tenantId: 'tenant-123',
                userId: 'user-456',
                resourceId: 'resource-789'
            };

            const isDeterministic = hkdf.verifyDeterministicDerivation(masterKey, hierarchy);

            assert.strictEqual(isDeterministic, true);
        });

        it('should ensure key uniqueness across different contexts', () => {
            const uniqueness = hkdf.verifyKeyUniqueness(masterKey);

            assert.strictEqual(uniqueness.tenantUniqueness, true);
            assert.strictEqual(uniqueness.userUniqueness, true);
            assert.strictEqual(uniqueness.resourceUniqueness, true);
            assert.strictEqual(uniqueness.allUnique, true);
        });

        it('should support version-aware derivation', () => {
            const hierarchy = {
                tenantId: 'tenant-123',
                userId: 'user-456',
                resourceId: 'resource-789'
            };

            const keyV1 = hkdf.deriveHierarchicalKey(masterKey, hierarchy, {
                tenantVersion: 1,
                userVersion: 1,
                resourceVersion: 1
            });

            const keyV2 = hkdf.deriveHierarchicalKey(masterKey, hierarchy, {
                tenantVersion: 2,
                userVersion: 1,
                resourceVersion: 1
            });

            // Different versions should produce different keys
            assert(!keyV1.equals(keyV2));
        });

        it('should reject incomplete hierarchy', () => {
            assert.throws(() => {
                hkdf.deriveHierarchicalKey(masterKey, { tenantId: 'tenant1' });
            }, /must include tenantId, userId, and resourceId/);
        });
    });

    describe('Security Features', () => {
        it('should properly zeroize buffers', () => {
            const buffer = Buffer.from('test-data-for-zeroization');
            const originalBuffer = Buffer.from(buffer);

            hkdf.zeroizeBuffer(buffer);

            // All bytes should be zero
            for (let i = 0; i < buffer.length; i++) {
                assert.strictEqual(buffer[i], 0);
            }

            // Should be different from original
            assert(!buffer.equals(originalBuffer));
        });

        it('should handle different key lengths', () => {
            const ikm = Buffer.from('test-ikm');
            const salt = Buffer.from('test-salt');
            const info = 'test-info';

            const key16 = hkdf.hkdf(ikm, salt, info, 16);
            const key32 = hkdf.hkdf(ikm, salt, info, 32);
            const key64 = hkdf.hkdf(ikm, salt, info, 64);

            assert.strictEqual(key16.length, 16);
            assert.strictEqual(key32.length, 32);
            assert.strictEqual(key64.length, 64);
        });
    });

    describe('Performance Benchmarking', () => {
        it('should run performance benchmark', async function() {
            this.timeout(30000); // Allow up to 30 seconds for benchmark

            const results = await hkdf.benchmarkDerivation(100);

            assert(results.iterations);
            assert(results.totalTime > 0);
            assert(results.averageTime > 0);
            assert(results.derivationsPerSecond > 0);
            assert(results.timestamp);

            // Should be reasonably fast (less than 1ms per derivation on modern hardware)
            assert(results.averageTime < 10);
        });

        it('should benchmark with different iteration counts', async function() {
            this.timeout(60000);

            const results100 = await hkdf.benchmarkDerivation(100);
            const results1000 = await hkdf.benchmarkDerivation(1000);

            // More iterations should take proportionally more time
            assert(results1000.totalTime > results100.totalTime);
            assert(Math.abs(results1000.averageTime - results100.averageTime) < 1);
        });
    });

    describe('Backward Compatibility', () => {
        it('should maintain legacy KeyDerivation API', () => {
            const masterKey = KeyDerivation.getMasterKey();
            assert(Buffer.isBuffer(masterKey));
            assert.strictEqual(masterKey.length, 32);

            const tenantKey = KeyDerivation.generateTenantKey();
            assert(Buffer.isBuffer(tenantKey));
            assert.strictEqual(tenantKey.length, 32);

            const derivedKey = KeyDerivation.deriveFromMaster(masterKey, 'test-context');
            assert(Buffer.isBuffer(derivedKey));
            assert.strictEqual(derivedKey.length, 32);
        });
    });

    describe('Integration Tests', () => {
        it('should work with real-world hierarchy example', () => {
            const hierarchy = {
                tenantId: 'acme-corp',
                userId: 'john.doe@acme.com',
                resourceId: 'expense-report-Q1-2024'
            };

            const resourceKey = hkdf.deriveHierarchicalKey(masterKey, hierarchy, {
                tenantVersion: 1,
                userVersion: 1,
                resourceVersion: 1,
                domain: 'expenseflow.com',
                userType: 'employee',
                resourceType: 'document',
                permissions: ['read', 'write', 'delete']
            });

            assert.strictEqual(resourceKey.length, 32);

            // Verify deterministic
            const resourceKey2 = hkdf.deriveHierarchicalKey(masterKey, hierarchy, {
                tenantVersion: 1,
                userVersion: 1,
                resourceVersion: 1,
                domain: 'expenseflow.com',
                userType: 'employee',
                resourceType: 'document',
                permissions: ['read', 'write', 'delete']
            });

            assert(resourceKey.equals(resourceKey2));
        });

        it('should handle complex context objects', () => {
            const complexContext = {
                level: 'resource',
                resourceId: 'complex-resource',
                resourceType: 'database',
                permissions: ['select', 'insert', 'update', 'delete'],
                metadata: {
                    schema: 'expenseflow',
                    table: 'transactions',
                    columns: ['id', 'amount', 'date', 'user_id']
                },
                constraints: {
                    tenantIsolation: true,
                    rowLevelSecurity: true
                }
            };

            const salt1 = hkdf.generateContextSalt(complexContext, 1);
            const salt2 = hkdf.generateContextSalt(complexContext, 1);
            const salt3 = hkdf.generateContextSalt(complexContext, 2);

            assert(salt1.equals(salt2));
            assert(!salt1.equals(salt3));
        });
    });
});