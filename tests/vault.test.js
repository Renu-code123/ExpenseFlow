/**
 * ZK-Vault Security Test Suite
 * Issue #679: Verifies encryption cycles and Zero-Knowledge integrity.
 */

const assert = require('assert');
const cryptoPayload = require('../utils/cryptoPayload');

describe('Zero-Knowledge Encrypted Vault', () => {

    const MOCK_SECRET = 'SuperSecret123!';
    const MOCK_SALT = '84c1cc789a6478b0...'; // 64 bytes hex
    let derivedKey;

    before(async () => {
        derivedKey = await cryptoPayload.deriveKey(MOCK_SECRET, MOCK_SALT);
    });

    describe('Cryptographic Primitives', () => {
        it('should encrypt and decrypt data correctly', () => {
            const original = 'Secret Merchant Name';
            const encrypted = cryptoPayload.encrypt(original, derivedKey);

            assert.notStrictEqual(original, encrypted);
            assert.ok(encrypted.includes(':')); // Format check

            const decrypted = cryptoPayload.decrypt(encrypted, derivedKey);
            assert.strictEqual(original, decrypted);
        });

        it('should fail decryption with wrong key (GCM Auth Tag failure)', () => {
            const encrypted = cryptoPayload.encrypt('Data', derivedKey);
            const wrongKey = Buffer.alloc(32, 0); // All zeros

            assert.throws(() => {
                cryptoPayload.decrypt(encrypted, wrongKey);
            }, /Unsupported state or unable to authenticate data/);
        });
    });

    describe('PII Masking Engine', () => {
        const maskingEngine = require('../services/maskingEngine');

        it('should redact emails and phone numbers', () => {
            const input = 'Contact me at test@example.com or 555-123-4567';
            const output = maskingEngine.mask(input);

            assert.ok(output.includes('[EMAIL_REDACTED]'));
            assert.ok(output.includes('[PHONE_REDACTED]'));
        });

        it('should mask credit cards but keep last 4 digits', () => {
            const input = 'My card is 4111 2222 3333 4444';
            const output = maskingEngine.mask(input);

            assert.ok(output.includes('****-****-****-4444'));
        });
    });
});
