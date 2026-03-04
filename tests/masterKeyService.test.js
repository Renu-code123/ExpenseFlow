/**
 * Master Key Service Test Suite
 * Issue #921: Unit tests for master key generation and secure storage
 */

const assert = require('assert');
const crypto = require('crypto');

// Mock the MasterKey model and mongoose
const mockMasterKey = {
    save: function() { return Promise.resolve(this); },
    recordAccess: function() { return Promise.resolve(this); },
    needsRotation: function() { return false; },
    keyId: 'mk-test-123',
    version: 1,
    status: 'active',
    purpose: 'encryption',
    storageBackend: 'memory',
    accessPolicy: {
        allowedOperations: ['generate', 'retrieve', 'rotate'],
        requireMFA: false
    },
    metadata: {
        createdBy: 'test-user',
        lastAccessed: new Date(),
        accessCount: 0
    },
    keyWrapper: {
        algorithm: 'aes-256-gcm',
        wrappedKey: 'mock-wrapped-key',
        wrappingKeyId: 'wrap-mk-test-123',
        iv: 'mock-iv',
        authTag: 'mock-auth-tag'
    }
};

// Mock the MasterKey constructor
function MockMasterKey(data) {
    Object.assign(this, mockMasterKey, data);
    this.save = function() { return Promise.resolve(this); };
    this.recordAccess = function() { return Promise.resolve(this); };
    this.needsRotation = function() { return false; };
}

MockMasterKey.findOne = function(query) {
    if (query.keyId === 'non-existent-key' || query.keyId === 'mk-not-found') {
        return Promise.resolve(null);
    }
    return Promise.resolve(new MockMasterKey(query));
};

MockMasterKey.find = function(query) {
    return Promise.resolve([new MockMasterKey(query)]);
};

// Mock the service
let MasterKeyService;
try {
    // Temporarily replace the model import
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function(id) {
        if (id === '../models/MasterKey') {
            return MockMasterKey;
        }
        return originalRequire.apply(this, arguments);
    };

    MasterKeyService = require('../services/masterKeyService');

    // Restore original require
    Module.prototype.require = originalRequire;
} catch (error) {
    console.error('Failed to mock MasterKey model:', error);
    MasterKeyService = require('../services/masterKeyService');
}

describe('Master Key Service (#921)', () => {
    let masterKeyService;

    beforeEach(() => {
        masterKeyService = new MasterKeyService();
    });

    describe('Master Key Generation', () => {
        it('should generate a cryptographically secure AES-256 key', () => {
            const key = masterKeyService.generateMasterKey();

            // Verify key length (32 bytes = 256 bits)
            assert.strictEqual(key.length, 32);

            // Verify it's not all zeros (extremely unlikely for CSPRNG)
            assert.notStrictEqual(key.toString('hex'), '00'.repeat(32));

            // Verify it's a Buffer
            assert(Buffer.isBuffer(key));
        });

        it('should generate unique keys on multiple calls', () => {
            const key1 = masterKeyService.generateMasterKey();
            const key2 = masterKeyService.generateMasterKey();

            // Keys should be different (extremely unlikely to be the same)
            assert.notStrictEqual(key1.toString('hex'), key2.toString('hex'));
        });

        it('should properly zeroize buffers after use', () => {
            const key = masterKeyService.generateMasterKey();
            const originalKey = Buffer.from(key);

            // Zeroize the buffer
            masterKeyService.zeroizeBuffer(key);

            // Verify all bytes are zero
            for (let i = 0; i < key.length; i++) {
                assert.strictEqual(key[i], 0);
            }

            // Original should be different from zeroized
            assert.notStrictEqual(originalKey.toString('hex'), key.toString('hex'));
        });
    });

    describe('Master Key Creation and Storage', () => {
        it('should create and store a new master key successfully', async () => {
            MockMasterKey.findOne = function() { return Promise.resolve(null); };

            const result = await masterKeyService.createMasterKey('encryption', {
                actor: { userId: 'test-user' },
                backend: 'memory'
            });

            assert(result.keyId);
            assert.strictEqual(result.version, 1);
            assert.strictEqual(result.purpose, 'encryption');
            assert(result.createdAt);
        });

        it('should generate unique key IDs', () => {
            const id1 = masterKeyService.generateKeyId('encryption');
            const id2 = masterKeyService.generateKeyId('encryption');

            assert.notStrictEqual(id1, id2);
            assert(id1.match(/^mk-encryption-\d+-[a-f0-9]+$/));
            assert(id2.match(/^mk-encryption-\d+-[a-f0-9]+$/));
        });
    });

    describe('Key Wrapping and Unwrapping', () => {
        it('should wrap and unwrap a key correctly', async () => {
            const originalKey = Buffer.from('test-key-material-32-bytes!!');
            const wrappingKey = crypto.randomBytes(32);

            const wrapped = await masterKeyService.wrapKey(originalKey, wrappingKey);

            assert(wrapped.wrapped);
            assert(wrapped.iv);
            assert(wrapped.authTag);
            assert(Buffer.isBuffer(wrapped.wrapped));
            assert(Buffer.isBuffer(wrapped.iv));

            // Test unwrapping with the same wrapping key
            const wrapperInfo = {
                algorithm: 'aes-256-gcm',
                wrappingKeyId: wrappingKey.toString('hex'),
                iv: wrapped.iv.toString('hex'),
                authTag: wrapped.authTag.toString('hex')
            };

            const unwrapped = await masterKeyService.unwrapKey(wrapped.wrapped, wrapperInfo);
            assert.strictEqual(Buffer.compare(unwrapped, originalKey), 0);
        });
    });

    describe('Storage Backend Abstraction', () => {
        it('should support in-memory storage for testing', async () => {
            const memoryAdapter = masterKeyService.storageBackends['memory'];

            assert(memoryAdapter);

            // Test basic operations
            await memoryAdapter.store('test-key', { data: 'test' });
            const retrieved = await memoryAdapter.retrieve('test-key');
            assert.strictEqual(retrieved.data, 'test');

            await memoryAdapter.delete('test-key');

            try {
                await memoryAdapter.retrieve('test-key');
                assert.fail('Should have thrown error for non-existent key');
            } catch (error) {
                assert(error.message.includes('Key not found'));
            }
        });
    });

    describe('Security Features', () => {
        it('should encrypt key material at rest', async () => {
            const keyMaterial = Buffer.from('test-key-material-32-bytes!!');

            const encrypted = await masterKeyService.encryptKeyMaterial(keyMaterial);

            // Verify it's encrypted (not plaintext)
            assert(!encrypted.includes('test-key-material-32-bytes'));
            assert(typeof encrypted === 'string');

            // Verify it can be decrypted back
            const decrypted = await masterKeyService.decryptKeyMaterial(encrypted);
            assert.strictEqual(Buffer.compare(decrypted, keyMaterial), 0);
        });

        it('should enforce access policies', () => {
            const policy = {
                allowedOperations: ['retrieve'],
                allowedRoles: ['admin'],
                requireMFA: true
            };

            // Should allow
            masterKeyService.enforceAccessPolicy({ accessPolicy: policy }, 'retrieve', {
                role: 'admin',
                mfaVerified: true
            });

            // Should deny - wrong operation
            assert.throws(() => {
                masterKeyService.enforceAccessPolicy({ accessPolicy: policy }, 'rotate', {
                    role: 'admin',
                    mfaVerified: true
                });
            }, /Operation rotate not allowed/);

            // Should deny - wrong role
            assert.throws(() => {
                masterKeyService.enforceAccessPolicy({ accessPolicy: policy }, 'retrieve', {
                    role: 'user',
                    mfaVerified: true
                });
            }, /Access denied/);

            // Should deny - no MFA
            assert.throws(() => {
                masterKeyService.enforceAccessPolicy({ accessPolicy: policy }, 'retrieve', {
                    role: 'admin',
                    mfaVerified: false
                });
            }, /MFA required/);
        });
    });
});