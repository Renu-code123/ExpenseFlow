const assert = require('assert');
const cryptVault = require('../services/cryptVault');

/**
 * Vault Security Tests
 * Issue #770: Forensic verification of Field-Level Encryption
 * NOTE: This test mocks the database to verify cryptographic logic without DB overhead.
 */
describe('Field-Level JIT Encryption (Unit)', () => {

    const mongoose = require('mongoose');
    const mockTenantId = new mongoose.Types.ObjectId();

    // Set a predictable master key for testing
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-vault-key-32-chars-long!!';

    // Mock KeyNode to avoid real DB interaction in pure unit test
    const KeyNode = require('../models/KeyNode');
    let findOneStub;
    let createStub;

    before(() => {
        // Simple manual stubbing if sinon isn't present
        const originalFindOne = KeyNode.findOne;
        const originalCreate = KeyNode.create;

        // Internal state for our simple mock
        const keys = new Map();

        KeyNode.findOne = async (query) => {
            return keys.get(query.tenantId.toString()) || null;
        };

        KeyNode.create = async (data) => {
            keys.set(data.tenantId.toString(), {
                ...data,
                algorithm: 'aes-256-gcm'
            });
            return keys.get(data.tenantId.toString());
        };
    });

    it('should generate a base64 encoded vault string', async () => {
        const plainText = 'Extremely Sensitive Merchant Data';
        const encrypted = await cryptVault.encrypt(plainText, mockTenantId);

        // Ensure standard string header is present
        assert(encrypted.startsWith('vault:v1:'));

        // Ensure the plaintext is nowhere in the payload
        assert(!encrypted.includes('Extremely'));
        assert(!encrypted.includes('Sensitive'));
    });

    it('should perfectly decrypt a matching vault string', async () => {
        const plainText = 'A $50,000 secret transaction';
        const encrypted = await cryptVault.encrypt(plainText, mockTenantId);

        const decrypted = await cryptVault.decrypt(encrypted, mockTenantId);

        assert.strictEqual(decrypted, plainText);
    });

    it('should mask decryption failures without crashing', async () => {
        const fakeEncrypted = 'vault:v1:bad_iv:bad_tag:bad_data';
        const decrypted = await cryptVault.decrypt(fakeEncrypted, mockTenantId);

        // Decryption failure falls back to a mask
        assert.strictEqual(decrypted, '********');
    });

    it('should ignore non-vault strings', async () => {
        const plain = 'regular text';
        const result = await cryptVault.decrypt(plain, mockTenantId);

        assert.strictEqual(result, plain);
    });
});
