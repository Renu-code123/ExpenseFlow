const crypto = require('crypto');
const logger = require('../utils/structuredLogger');

/**
 * HSM / External KMS Integration Layer
 * Issue #926: Pluggable support for external key providers
 *
 * Features:
 * - Adapter pattern for multiple KMS providers (AWS KMS, Azure Key Vault, Google Cloud KMS)
 * - Envelope encryption support
 * - Fallback mechanism with health checks
 * - Circuit breaker pattern for resilience
 * - Audit logging and compliance
 */

class CircuitBreaker {
    constructor(failureThreshold = 5, recoveryTimeout = 60000) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeout = recoveryTimeout;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }

    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime
        };
    }
}

class KMSProviderAdapter {
    constructor(config = {}) {
        this.config = config;
        this.circuitBreaker = new CircuitBreaker(
            config.failureThreshold || 5,
            config.recoveryTimeout || 60000
        );
        this.providerName = 'base';
        this.supportedAlgorithms = [];
    }

    async encrypt(keyId, plaintext, options = {}) {
        throw new Error('encrypt() must be implemented by subclass');
    }

    async decrypt(keyId, ciphertext, options = {}) {
        throw new Error('decrypt() must be implemented by subclass');
    }

    async generateKey(keyId, options = {}) {
        throw new Error('generateKey() must be implemented by subclass');
    }

    async deleteKey(keyId) {
        throw new Error('deleteKey() must be implemented by subclass');
    }

    async getKeyInfo(keyId) {
        throw new Error('getKeyInfo() must be implemented by subclass');
    }

    async healthCheck() {
        throw new Error('healthCheck() must be implemented by subclass');
    }

    async envelopeEncrypt(dek, kekId, options = {}) {
        // Generate a random DEK if not provided
        const dataEncryptionKey = dek || crypto.randomBytes(32);

        // Encrypt the DEK with the KEK
        const encryptedDek = await this.encrypt(kekId, dataEncryptionKey, options);

        return {
            encryptedDataKey: encryptedDek,
            dataEncryptionKey: dataEncryptionKey,
            keyId: kekId,
            algorithm: options.algorithm || 'aes-256-gcm'
        };
    }

    async envelopeDecrypt(envelope, options = {}) {
        // Decrypt the DEK using the KEK
        const dataEncryptionKey = await this.decrypt(envelope.keyId, envelope.encryptedDataKey, options);

        return {
            dataEncryptionKey: dataEncryptionKey,
            keyId: envelope.keyId,
            algorithm: envelope.algorithm
        };
    }

    isAlgorithmSupported(algorithm) {
        return this.supportedAlgorithms.includes(algorithm);
    }

    async executeWithCircuitBreaker(operation) {
        return this.circuitBreaker.execute(operation);
    }
}

class AWSKMSAdapter extends KMSProviderAdapter {
    constructor(config = {}) {
        super(config);
        this.providerName = 'aws-kms';

        const AWS = require('aws-sdk');
        this.kms = new AWS.KMS({
            region: config.region || process.env.AWS_REGION || 'us-east-1',
            accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
        });

        this.supportedAlgorithms = [
            'AES_256',
            'RSAES_OAEP_SHA_256',
            'ECC_NIST_P256'
        ];
    }

    async encrypt(keyId, plaintext, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const params = {
                KeyId: keyId,
                Plaintext: plaintext,
                EncryptionAlgorithm: options.algorithm || 'SYMMETRIC_DEFAULT'
            };

            const result = await this.kms.encrypt(params).promise();

            logger.info('AWS KMS encryption successful', {
                keyId,
                algorithm: params.EncryptionAlgorithm,
                ciphertextLength: result.CiphertextBlob.length
            });

            return result.CiphertextBlob;
        });
    }

    async decrypt(keyId, ciphertext, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const params = {
                KeyId: keyId,
                CiphertextBlob: ciphertext,
                EncryptionAlgorithm: options.algorithm
            };

            const result = await this.kms.decrypt(params).promise();

            logger.info('AWS KMS decryption successful', {
                keyId,
                algorithm: result.EncryptionAlgorithm,
                plaintextLength: result.Plaintext.length
            });

            return result.Plaintext;
        });
    }

    async generateKey(keyId, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const params = {
                KeyUsage: options.keyUsage || 'ENCRYPT_DECRYPT',
                KeySpec: options.keySpec || 'SYMMETRIC_DEFAULT',
                Description: options.description || `ExpenseFlow key: ${keyId}`,
                Tags: [
                    { TagKey: 'Application', TagValue: 'ExpenseFlow' },
                    { TagKey: 'Environment', TagValue: process.env.NODE_ENV || 'development' }
                ]
            };

            const result = await this.kms.createKey(params).promise();

            // Create an alias for the key
            await this.kms.createAlias({
                AliasName: `alias/expenseflow/${keyId}`,
                TargetKeyId: result.KeyMetadata.KeyId
            }).promise();

            logger.info('AWS KMS key generated', {
                keyId: result.KeyMetadata.KeyId,
                alias: `alias/expenseflow/${keyId}`,
                keySpec: result.KeyMetadata.KeySpec
            });

            return result.KeyMetadata.KeyId;
        });
    }

    async deleteKey(keyId) {
        return this.executeWithCircuitBreaker(async () => {
            // Schedule key deletion (AWS requires a waiting period)
            const params = {
                KeyId: keyId,
                PendingWindowInDays: 7
            };

            await this.kms.scheduleKeyDeletion(params).promise();

            logger.info('AWS KMS key deletion scheduled', { keyId });

            return true;
        });
    }

    async getKeyInfo(keyId) {
        return this.executeWithCircuitBreaker(async () => {
            const params = { KeyId: keyId };
            const result = await this.kms.describeKey(params).promise();

            return {
                keyId: result.KeyMetadata.KeyId,
                keyState: result.KeyMetadata.KeyState,
                keyUsage: result.KeyMetadata.KeyUsage,
                keySpec: result.KeyMetadata.KeySpec,
                creationDate: result.KeyMetadata.CreationDate,
                enabled: result.KeyMetadata.Enabled
            };
        });
    }

    async healthCheck() {
        try {
            await this.executeWithCircuitBreaker(async () => {
                await this.kms.listKeys({ Limit: 1 }).promise();
            });
            return { status: 'healthy', provider: this.providerName };
        } catch (error) {
            logger.error('AWS KMS health check failed', { error: error.message });
            return { status: 'unhealthy', provider: this.providerName, error: error.message };
        }
    }
}

class AzureKeyVaultAdapter extends KMSProviderAdapter {
    constructor(config = {}) {
        super(config);
        this.providerName = 'azure-keyvault';

        const { KeyClient } = require('@azure/keyvault-keys');
        const { DefaultAzureCredential } = require('@azure/identity');

        this.keyVaultUrl = config.keyVaultUrl || process.env.AZURE_KEY_VAULT_URL;
        if (!this.keyVaultUrl) {
            throw new Error('Azure Key Vault URL is required');
        }

        const credential = new DefaultAzureCredential();
        this.client = new KeyClient(this.keyVaultUrl, credential);

        this.supportedAlgorithms = [
            'RSA-OAEP-256',
            'RSA-OAEP',
            'RSA1_5',
            'A256GCM',
            'A128GCM'
        ];
    }

    async encrypt(keyId, plaintext, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const key = await this.client.getKey(keyId);
            const algorithm = options.algorithm || 'RSA-OAEP-256';

            const encryptResult = await this.client.encrypt(key.name, algorithm, plaintext);

            logger.info('Azure Key Vault encryption successful', {
                keyId,
                algorithm,
                ciphertextLength: encryptResult.result.length
            });

            return Buffer.from(encryptResult.result);
        });
    }

    async decrypt(keyId, ciphertext, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const key = await this.client.getKey(keyId);
            const algorithm = options.algorithm || 'RSA-OAEP-256';

            const decryptResult = await this.client.decrypt(key.name, algorithm, ciphertext);

            logger.info('Azure Key Vault decryption successful', {
                keyId,
                algorithm,
                plaintextLength: decryptResult.result.length
            });

            return Buffer.from(decryptResult.result);
        });
    }

    async generateKey(keyId, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const keyType = options.keyType || 'RSA';
            const keySize = options.keySize || 2048;

            const createResult = await this.client.createKey(keyId, keyType, {
                keySize: keySize,
                enabled: true,
                tags: {
                    Application: 'ExpenseFlow',
                    Environment: process.env.NODE_ENV || 'development'
                }
            });

            logger.info('Azure Key Vault key generated', {
                keyId: createResult.name,
                keyType: createResult.keyType,
                keySize: createResult.key?.n?.length * 8 || keySize
            });

            return createResult.name;
        });
    }

    async deleteKey(keyId) {
        return this.executeWithCircuitBreaker(async () => {
            await this.client.beginDeleteKey(keyId);
            logger.info('Azure Key Vault key deletion initiated', { keyId });
            return true;
        });
    }

    async getKeyInfo(keyId) {
        return this.executeWithCircuitBreaker(async () => {
            const key = await this.client.getKey(keyId);

            return {
                keyId: key.name,
                keyType: key.keyType,
                enabled: key.properties.enabled,
                createdOn: key.properties.createdOn,
                updatedOn: key.properties.updatedOn,
                keySize: key.key?.n?.length || null
            };
        });
    }

    async healthCheck() {
        try {
            await this.executeWithCircuitBreaker(async () => {
                await this.client.listPropertiesOfKeys({ maxPageSize: 1 }).next();
            });
            return { status: 'healthy', provider: this.providerName };
        } catch (error) {
            logger.error('Azure Key Vault health check failed', { error: error.message });
            return { status: 'unhealthy', provider: this.providerName, error: error.message };
        }
    }
}

class GoogleCloudKMSAdapter extends KMSProviderAdapter {
    constructor(config = {}) {
        super(config);
        this.providerName = 'gcp-kms';

        const { KeyManagementServiceClient } = require('@google-cloud/kms');
        this.client = new KeyManagementServiceClient({
            projectId: config.projectId || process.env.GCP_PROJECT_ID,
            keyFilename: config.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS
        });

        this.projectId = config.projectId || process.env.GCP_PROJECT_ID;
        this.location = config.location || 'global';
        this.keyRing = config.keyRing || 'expenseflow-keyring';

        this.supportedAlgorithms = [
            'GOOGLE_SYMMETRIC_ENCRYPTION',
            'RSA_DECRYPT_OAEP_2048_SHA256',
            'RSA_DECRYPT_OAEP_3072_SHA256',
            'RSA_DECRYPT_OAEP_4096_SHA256'
        ];
    }

    async encrypt(keyId, plaintext, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const name = this.client.cryptoKeyPath(
                this.projectId,
                this.location,
                this.keyRing,
                keyId
            );

            const [result] = await this.client.encrypt({
                name,
                plaintext: plaintext
            });

            logger.info('Google Cloud KMS encryption successful', {
                keyId,
                ciphertextLength: result.ciphertext.length
            });

            return Buffer.from(result.ciphertext);
        });
    }

    async decrypt(keyId, ciphertext, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const name = this.client.cryptoKeyPath(
                this.projectId,
                this.location,
                this.keyRing,
                keyId
            );

            const [result] = await this.client.decrypt({
                name,
                ciphertext: ciphertext
            });

            logger.info('Google Cloud KMS decryption successful', {
                keyId,
                plaintextLength: result.plaintext.length
            });

            return Buffer.from(result.plaintext);
        });
    }

    async generateKey(keyId, options = {}) {
        return this.executeWithCircuitBreaker(async () => {
            const parent = this.client.keyRingPath(this.projectId, this.location, this.keyRing);
            const algorithm = options.algorithm || 'GOOGLE_SYMMETRIC_ENCRYPTION';

            const [key] = await this.client.createCryptoKey({
                parent,
                cryptoKeyId: keyId,
                cryptoKey: {
                    purpose: 'ENCRYPT_DECRYPT',
                    versionTemplate: {
                        algorithm: algorithm
                    }
                },
                labels: {
                    application: 'expenseflow',
                    environment: process.env.NODE_ENV || 'development'
                }
            });

            logger.info('Google Cloud KMS key generated', {
                keyId: key.name.split('/').pop(),
                algorithm: key.versionTemplate.algorithm
            });

            return key.name.split('/').pop();
        });
    }

    async deleteKey(keyId) {
        return this.executeWithCircuitBreaker(async () => {
            const name = this.client.cryptoKeyPath(
                this.projectId,
                this.location,
                this.keyRing,
                keyId
            );

            await this.client.destroyCryptoKeyVersion({
                name: `${name}/cryptoKeyVersions/1`
            });

            logger.info('Google Cloud KMS key version destroyed', { keyId });
            return true;
        });
    }

    async getKeyInfo(keyId) {
        return this.executeWithCircuitBreaker(async () => {
            const name = this.client.cryptoKeyPath(
                this.projectId,
                this.location,
                this.keyRing,
                keyId
            );

            const [key] = await this.client.getCryptoKey({ name });

            return {
                keyId: key.name.split('/').pop(),
                purpose: key.purpose,
                algorithm: key.versionTemplate?.algorithm,
                createdTime: key.createTime,
                labels: key.labels
            };
        });
    }

    async healthCheck() {
        try {
            await this.executeWithCircuitBreaker(async () => {
                const parent = this.client.keyRingPath(this.projectId, this.location, this.keyRing);
                await this.client.listCryptoKeys({ parent, pageSize: 1 });
            });
            return { status: 'healthy', provider: this.providerName };
        } catch (error) {
            logger.error('Google Cloud KMS health check failed', { error: error.message });
            return { status: 'unhealthy', provider: this.providerName, error: error.message };
        }
    }
}

class KMSIntegrationService {
    constructor(config = {}) {
        this.config = config;
        this.providers = new Map();
        this.fallbackOrder = config.fallbackOrder || ['aws-kms', 'azure-keyvault', 'gcp-kms'];
        this.envelopeCache = new Map();
        this.auditLog = [];

        this.initializeProviders();
    }

    initializeProviders() {
        const providerConfigs = this.config.providers || {};

        // Initialize AWS KMS
        if (providerConfigs.aws || process.env.AWS_REGION) {
            this.providers.set('aws-kms', new AWSKMSAdapter(providerConfigs.aws));
        }

        // Initialize Azure Key Vault
        if (providerConfigs.azure || process.env.AZURE_KEY_VAULT_URL) {
            this.providers.set('azure-keyvault', new AzureKeyVaultAdapter(providerConfigs.azure));
        }

        // Initialize Google Cloud KMS
        if (providerConfigs.gcp || process.env.GCP_PROJECT_ID) {
            this.providers.set('gcp-kms', new GoogleCloudKMSAdapter(providerConfigs.gcp));
        }

        logger.info('KMS providers initialized', {
            providers: Array.from(this.providers.keys()),
            fallbackOrder: this.fallbackOrder
        });
    }

    async encrypt(keyId, plaintext, options = {}) {
        const errors = [];

        for (const providerName of this.fallbackOrder) {
            const provider = this.providers.get(providerName);
            if (!provider) continue;

            try {
                const result = await provider.encrypt(keyId, plaintext, options);
                this.logAudit('encrypt', providerName, keyId, 'success');
                return {
                    ciphertext: result,
                    provider: providerName,
                    envelope: options.envelope ? await provider.envelopeEncrypt(plaintext, keyId, options) : null
                };
            } catch (error) {
                errors.push({ provider: providerName, error: error.message });
                this.logAudit('encrypt', providerName, keyId, 'failure', error.message);
                logger.warn(`KMS provider ${providerName} failed`, { error: error.message });
            }
        }

        throw new Error(`All KMS providers failed: ${errors.map(e => `${e.provider}: ${e.error}`).join(', ')}`);
    }

    async decrypt(keyId, ciphertext, options = {}) {
        const errors = [];

        for (const providerName of this.fallbackOrder) {
            const provider = this.providers.get(providerName);
            if (!provider) continue;

            try {
                const result = await provider.decrypt(keyId, ciphertext, options);
                this.logAudit('decrypt', providerName, keyId, 'success');
                return {
                    plaintext: result,
                    provider: providerName
                };
            } catch (error) {
                errors.push({ provider: providerName, error: error.message });
                this.logAudit('decrypt', providerName, keyId, 'failure', error.message);
                logger.warn(`KMS provider ${providerName} failed`, { error: error.message });
            }
        }

        throw new Error(`All KMS providers failed: ${errors.map(e => `${e.provider}: ${e.error}`).join(', ')}`);
    }

    async envelopeEncrypt(dataEncryptionKey, keyEncryptionKeyId, options = {}) {
        const cacheKey = `${keyEncryptionKeyId}:${options.algorithm || 'aes-256-gcm'}`;

        // Check cache first
        if (this.envelopeCache.has(cacheKey) && !options.skipCache) {
            return this.envelopeCache.get(cacheKey);
        }

        const errors = [];

        for (const providerName of this.fallbackOrder) {
            const provider = this.providers.get(providerName);
            if (!provider) continue;

            try {
                const envelope = await provider.envelopeEncrypt(dataEncryptionKey, keyEncryptionKeyId, options);

                // Cache the envelope
                this.envelopeCache.set(cacheKey, envelope);

                this.logAudit('envelope_encrypt', providerName, keyEncryptionKeyId, 'success');
                return envelope;
            } catch (error) {
                errors.push({ provider: providerName, error: error.message });
                this.logAudit('envelope_encrypt', providerName, keyEncryptionKeyId, 'failure', error.message);
                logger.warn(`KMS provider ${providerName} envelope encryption failed`, { error: error.message });
            }
        }

        throw new Error(`All KMS providers failed envelope encryption: ${errors.map(e => `${e.provider}: ${e.error}`).join(', ')}`);
    }

    async envelopeDecrypt(envelope, options = {}) {
        const cacheKey = `${envelope.keyId}:${envelope.algorithm}`;

        // Check cache first
        if (this.envelopeCache.has(cacheKey) && !options.skipCache) {
            return this.envelopeCache.get(cacheKey);
        }

        const errors = [];

        for (const providerName of this.fallbackOrder) {
            const provider = this.providers.get(providerName);
            if (!provider) continue;

            try {
                const result = await provider.envelopeDecrypt(envelope, options);

                // Cache the result
                this.envelopeCache.set(cacheKey, result);

                this.logAudit('envelope_decrypt', providerName, envelope.keyId, 'success');
                return result;
            } catch (error) {
                errors.push({ provider: providerName, error: error.message });
                this.logAudit('envelope_decrypt', providerName, envelope.keyId, 'failure', error.message);
                logger.warn(`KMS provider ${providerName} envelope decryption failed`, { error: error.message });
            }
        }

        throw new Error(`All KMS providers failed envelope decryption: ${errors.map(e => `${e.provider}: ${e.error}`).join(', ')}`);
    }

    async generateKey(keyId, options = {}) {
        const errors = [];

        for (const providerName of this.fallbackOrder) {
            const provider = this.providers.get(providerName);
            if (!provider) continue;

            try {
                const result = await provider.generateKey(keyId, options);
                this.logAudit('generate_key', providerName, keyId, 'success');
                return {
                    keyId: result,
                    provider: providerName
                };
            } catch (error) {
                errors.push({ provider: providerName, error: error.message });
                this.logAudit('generate_key', providerName, keyId, 'failure', error.message);
                logger.warn(`KMS provider ${providerName} key generation failed`, { error: error.message });
            }
        }

        throw new Error(`All KMS providers failed key generation: ${errors.map(e => `${e.provider}: ${e.error}`).join(', ')}`);
    }

    async healthCheck() {
        const results = {};

        for (const [providerName, provider] of this.providers) {
            try {
                results[providerName] = await provider.healthCheck();
            } catch (error) {
                results[providerName] = {
                    status: 'error',
                    provider: providerName,
                    error: error.message
                };
            }
        }

        const healthyProviders = Object.values(results).filter(r => r.status === 'healthy').length;
        const overallStatus = healthyProviders > 0 ? 'healthy' : 'unhealthy';

        logger.info('KMS health check completed', {
            overallStatus,
            healthyProviders,
            totalProviders: this.providers.size,
            results
        });

        return {
            overallStatus,
            healthyProviders,
            totalProviders: this.providers.size,
            results,
            timestamp: new Date().toISOString()
        };
    }

    getProvider(providerName) {
        return this.providers.get(providerName);
    }

    listProviders() {
        return Array.from(this.providers.keys());
    }

    clearEnvelopeCache() {
        this.envelopeCache.clear();
        logger.info('Envelope cache cleared');
    }

    logAudit(operation, provider, keyId, status, error = null) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            operation,
            provider,
            keyId,
            status,
            error,
            userId: this.config.currentUserId,
            sessionId: this.config.sessionId
        };

        this.auditLog.push(auditEntry);

        // Keep only last 1000 entries
        if (this.auditLog.length > 1000) {
            this.auditLog.shift();
        }

        logger.info('KMS audit log entry', auditEntry);
    }

    getAuditLog(limit = 100) {
        return this.auditLog.slice(-limit);
    }
}

module.exports = {
    KMSIntegrationService,
    KMSProviderAdapter,
    AWSKMSAdapter,
    AzureKeyVaultAdapter,
    GoogleCloudKMSAdapter,
    CircuitBreaker
};