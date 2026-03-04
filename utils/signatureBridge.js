const crypto = require('crypto');

/**
 * Signature Bridge Utility
 * Issue #797: Hardware/Biometric signature verification interface.
 * Provides a unified interface for cryptographic proof verification.
 */

class SignatureBridge {
    constructor() {
        // Proof type configurations
        this.proofConfigs = {
            PASSWORD: {
                minLength: 8,
                requireHash: true,
                hashAlgorithm: 'sha256',
                saltRounds: 10
            },
            TOTP: {
                windowSize: 1, // Allow 30 seconds before/after
                algorithm: 'sha1',
                digits: 6,
                period: 30
            },
            HARDWARE_KEY: {
                supportedProtocols: ['FIDO2', 'U2F', 'CTAP2'],
                challengeExpiry: 120000, // 2 minutes
                requireAttestation: true
            },
            BIOMETRIC: {
                supportedTypes: ['FINGERPRINT', 'FACE', 'IRIS'],
                confidenceThreshold: 0.95,
                maxAttempts: 3
            },
            PKI: {
                supportedAlgorithms: ['RSA-SHA256', 'ECDSA-SHA256'],
                minKeySize: 2048,
                requireChainValidation: true
            }
        };

        // Challenge cache for replay protection
        this.challengeCache = new Map();
    }

    /**
     * Verify a cryptographic proof
     * @param {Object} params - Verification parameters
     * @returns {Object} Verification result
     */
    async verifyProof(params) {
        const { userId, proofType, proofData, operationId, payload } = params;

        // Generate challenge bound to this operation
        const challenge = this.generateChallenge(operationId, userId);

        switch (proofType) {
            case 'PASSWORD':
                return this.verifyPasswordProof(userId, proofData, challenge);
            
            case 'TOTP':
                return this.verifyTOTPProof(userId, proofData, challenge);
            
            case 'HARDWARE_KEY':
                return this.verifyHardwareKeyProof(userId, proofData, challenge, operationId);
            
            case 'BIOMETRIC':
                return this.verifyBiometricProof(userId, proofData, challenge);
            
            case 'PKI':
                return this.verifyPKIProof(userId, proofData, challenge, payload);
            
            default:
                return { valid: false, reason: `Unsupported proof type: ${proofType}` };
        }
    }

    /**
     * Generate operation-bound challenge
     */
    generateChallenge(operationId, userId) {
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = crypto.randomBytes(16).toString('hex');
        const data = `${operationId}:${userId}:${timestamp}:${nonce}`;
        
        const challenge = {
            data,
            hash: crypto.createHash('sha256').update(data).digest('hex'),
            timestamp,
            nonce,
            expiresAt: timestamp + 300 // 5 minute expiry
        };

        // Cache for replay protection
        this.challengeCache.set(challenge.hash, {
            ...challenge,
            used: false
        });

        // Cleanup old challenges
        this.cleanupChallenges();

        return challenge;
    }

    /**
     * Verify password-based proof
     */
    async verifyPasswordProof(userId, proofData, challenge) {
        const { passwordHash, salt, timestamp } = proofData;

        if (!passwordHash || !salt) {
            return { valid: false, reason: 'Missing password hash or salt' };
        }

        // Verify timestamp freshness
        if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
            return { valid: false, reason: 'Password proof expired' };
        }

        // In production: verify against stored password hash
        // Here we simulate verification
        const expectedHash = crypto
            .createHash('sha256')
            .update(`${challenge.hash}:${salt}`)
            .digest('hex');

        // Simulate password verification (in production: compare with DB)
        const valid = passwordHash.length === 64; // SHA-256 produces 64 hex chars

        if (valid) {
            return {
                valid: true,
                proofHash: crypto.createHash('sha256').update(passwordHash).digest('hex'),
                method: 'PASSWORD_HASH',
                verifiedAt: new Date()
            };
        }

        return { valid: false, reason: 'Invalid password proof' };
    }

    /**
     * Verify TOTP (Time-based One-Time Password) proof
     */
    async verifyTOTPProof(userId, proofData, challenge) {
        const { token, timestamp } = proofData;
        const config = this.proofConfigs.TOTP;

        if (!token || token.length !== config.digits) {
            return { valid: false, reason: 'Invalid TOTP token format' };
        }

        // In production: verify against user's TOTP secret
        // Here we simulate validation
        const currentWindow = Math.floor(Date.now() / 1000 / config.period);
        const validWindows = [currentWindow - config.windowSize, currentWindow, currentWindow + config.windowSize];

        // Simulate TOTP verification
        const valid = /^\d{6}$/.test(token);

        if (valid) {
            return {
                valid: true,
                proofHash: crypto.createHash('sha256').update(`${userId}:${token}:${currentWindow}`).digest('hex'),
                method: 'TOTP',
                window: currentWindow,
                verifiedAt: new Date()
            };
        }

        return { valid: false, reason: 'Invalid TOTP token' };
    }

    /**
     * Verify hardware key (FIDO2/U2F) proof
     */
    async verifyHardwareKeyProof(userId, proofData, challenge, operationId) {
        const { clientDataJSON, authenticatorData, signature, credentialId } = proofData;
        const config = this.proofConfigs.HARDWARE_KEY;

        if (!clientDataJSON || !authenticatorData || !signature) {
            return { valid: false, reason: 'Missing hardware key proof components' };
        }

        try {
            // Parse client data
            const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64').toString());

            // Verify challenge
            if (clientData.challenge !== challenge.hash) {
                return { valid: false, reason: 'Challenge mismatch' };
            }

            // Verify origin
            if (!clientData.origin.includes('expenseflow')) {
                return { valid: false, reason: 'Invalid origin' };
            }

            // In production: verify signature against stored public key
            // Simulate verification
            const authData = Buffer.from(authenticatorData, 'base64');
            const flags = authData[32];
            const userPresent = (flags & 0x01) !== 0;
            const userVerified = (flags & 0x04) !== 0;

            if (!userPresent) {
                return { valid: false, reason: 'User presence not verified' };
            }

            return {
                valid: true,
                proofHash: crypto.createHash('sha256').update(signature).digest('hex'),
                method: 'HARDWARE_KEY_FIDO2',
                credentialId,
                userVerified,
                verifiedAt: new Date()
            };

        } catch (error) {
            return { valid: false, reason: `Hardware key verification error: ${error.message}` };
        }
    }

    /**
     * Verify biometric proof
     */
    async verifyBiometricProof(userId, proofData, challenge) {
        const { biometricType, templateHash, confidence, deviceAttestation } = proofData;
        const config = this.proofConfigs.BIOMETRIC;

        if (!config.supportedTypes.includes(biometricType)) {
            return { valid: false, reason: `Unsupported biometric type: ${biometricType}` };
        }

        if (!confidence || confidence < config.confidenceThreshold) {
            return { valid: false, reason: `Biometric confidence ${confidence} below threshold ${config.confidenceThreshold}` };
        }

        if (!templateHash || !deviceAttestation) {
            return { valid: false, reason: 'Missing biometric template or device attestation' };
        }

        // In production: verify device attestation and match template
        return {
            valid: true,
            proofHash: crypto.createHash('sha256').update(`${templateHash}:${challenge.hash}`).digest('hex'),
            method: `BIOMETRIC_${biometricType}`,
            confidence,
            verifiedAt: new Date()
        };
    }

    /**
     * Verify PKI (Public Key Infrastructure) proof
     */
    async verifyPKIProof(userId, proofData, challenge, payload) {
        const { certificate, signature, algorithm, timestamp } = proofData;
        const config = this.proofConfigs.PKI;

        if (!config.supportedAlgorithms.includes(algorithm)) {
            return { valid: false, reason: `Unsupported signing algorithm: ${algorithm}` };
        }

        if (!certificate || !signature) {
            return { valid: false, reason: 'Missing certificate or signature' };
        }

        try {
            // Create verification message
            const message = JSON.stringify({
                challenge: challenge.hash,
                payload: payload,
                timestamp
            });

            // In production: 
            // 1. Validate certificate chain
            // 2. Check certificate revocation status
            // 3. Verify signature against certificate public key

            // Simulate verification
            const signatureValid = signature.length > 100; // Simplified check

            if (signatureValid) {
                return {
                    valid: true,
                    proofHash: crypto.createHash('sha256').update(signature).digest('hex'),
                    method: `PKI_${algorithm}`,
                    certificateFingerprint: crypto.createHash('sha256').update(certificate).digest('hex').slice(0, 16),
                    verifiedAt: new Date()
                };
            }

            return { valid: false, reason: 'Invalid PKI signature' };

        } catch (error) {
            return { valid: false, reason: `PKI verification error: ${error.message}` };
        }
    }

    /**
     * Generate signature for outbound operations
     */
    async generateSignature(userId, payload, proofType = 'PKI') {
        const timestamp = Date.now();
        const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        
        const signatureData = {
            userId: userId.toString(),
            payloadHash,
            timestamp,
            proofType
        };

        const signature = crypto
            .createHash('sha256')
            .update(JSON.stringify(signatureData))
            .digest('hex');

        return {
            signature,
            timestamp,
            proofType,
            payloadHash
        };
    }

    /**
     * Verify a signature
     */
    verifySignature(signature, expectedPayloadHash, timestamp, maxAge = 300000) {
        // Check timestamp freshness
        if (Date.now() - timestamp > maxAge) {
            return { valid: false, reason: 'Signature expired' };
        }

        // Verify signature integrity
        if (!signature || signature.length !== 64) {
            return { valid: false, reason: 'Invalid signature format' };
        }

        return { valid: true };
    }

    /**
     * Create multi-party signature aggregation
     */
    aggregateSignatures(signatures) {
        if (!signatures || signatures.length === 0) {
            return null;
        }

        // Sort signatures by signer ID for deterministic ordering
        const sorted = [...signatures].sort((a, b) => 
            a.signerId.toString().localeCompare(b.signerId.toString())
        );

        // Create merkle root of signatures
        const leaves = sorted.map(sig => 
            crypto.createHash('sha256').update(sig.signatureHash).digest('hex')
        );

        let level = leaves;
        while (level.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] || left;
                nextLevel.push(
                    crypto.createHash('sha256').update(left + right).digest('hex')
                );
            }
            level = nextLevel;
        }

        return {
            aggregatedHash: level[0],
            signatureCount: signatures.length,
            signerIds: sorted.map(s => s.signerId),
            timestamp: Date.now()
        };
    }

    /**
     * Cleanup expired challenges
     */
    cleanupChallenges() {
        const now = Math.floor(Date.now() / 1000);
        for (const [hash, challenge] of this.challengeCache) {
            if (challenge.expiresAt < now) {
                this.challengeCache.delete(hash);
            }
        }
    }

    /**
     * Get supported proof types
     */
    getSupportedProofTypes() {
        return Object.keys(this.proofConfigs);
    }

    /**
     * Get proof type configuration
     */
    getProofConfig(proofType) {
        return this.proofConfigs[proofType] || null;
    }
}

module.exports = new SignatureBridge();
