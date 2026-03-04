const { expect } = require('chai');
const sinon = require('sinon');
const {
    KMSIntegrationService,
    KMSProviderAdapter,
    AWSKMSAdapter,
    AzureKeyVaultAdapter,
    GoogleCloudKMSAdapter,
    CircuitBreaker
} = require('../services/kmsIntegrationService');

describe('HSM / External KMS Integration Layer (#926)', () => {
    let kmsService;
    let mockProviders;

    beforeEach(() => {
        mockProviders = {
            'aws-kms': {
                encrypt: sinon.stub(),
                decrypt: sinon.stub(),
                generateKey: sinon.stub(),
                envelopeEncrypt: sinon.stub(),
                envelopeDecrypt: sinon.stub(),
                healthCheck: sinon.stub(),
                circuitBreaker: { execute: sinon.stub() }
            },
            'azure-keyvault': {
                encrypt: sinon.stub(),
                decrypt: sinon.stub(),
                generateKey: sinon.stub(),
                envelopeEncrypt: sinon.stub(),
                envelopeDecrypt: sinon.stub(),
                healthCheck: sinon.stub(),
                circuitBreaker: { execute: sinon.stub() }
            },
            'gcp-kms': {
                encrypt: sinon.stub(),
                decrypt: sinon.stub(),
                generateKey: sinon.stub(),
                envelopeEncrypt: sinon.stub(),
                envelopeDecrypt: sinon.stub(),
                healthCheck: sinon.stub(),
                circuitBreaker: { execute: sinon.stub() }
            }
        };

        kmsService = new KMSIntegrationService({
            providers: {
                aws: { region: 'us-east-1' },
                azure: { keyVaultUrl: 'https://test.vault.azure.net' },
                gcp: { projectId: 'test-project' }
            },
            fallbackOrder: ['aws-kms', 'azure-keyvault', 'gcp-kms']
        });

        // Replace providers with mocks
        kmsService.providers = new Map(Object.entries(mockProviders));
    });

    describe('Circuit Breaker', () => {
        let circuitBreaker;

        beforeEach(() => {
            circuitBreaker = new CircuitBreaker(3, 1000);
        });

        it('should start in CLOSED state', () => {
            expect(circuitBreaker.getState().state).to.equal('CLOSED');
            expect(circuitBreaker.getState().failureCount).to.equal(0);
        });

        it('should remain CLOSED on successful operations', async () => {
            const operation = sinon.stub().resolves('success');

            await circuitBreaker.execute(operation);
            expect(circuitBreaker.getState().state).to.equal('CLOSED');
            expect(circuitBreaker.getState().failureCount).to.equal(0);
        });

        it('should open after failure threshold', async () => {
            const operation = sinon.stub().rejects(new Error('Test error'));

            for (let i = 0; i < 3; i++) {
                try {
                    await circuitBreaker.execute(operation);
                } catch (error) {
                    // Expected
                }
            }

            expect(circuitBreaker.getState().state).to.equal('OPEN');
            expect(circuitBreaker.getState().failureCount).to.equal(3);
        });

        it('should transition to HALF_OPEN after recovery timeout', async () => {
            const operation = sinon.stub().rejects(new Error('Test error'));

            // Fail to open circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await circuitBreaker.execute(operation);
                } catch (error) {
                    // Expected
                }
            }

            expect(circuitBreaker.getState().state).to.equal('OPEN');

            // Wait for recovery timeout
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Next call should be HALF_OPEN
            const successOperation = sinon.stub().resolves('success');
            await circuitBreaker.execute(successOperation);

            expect(circuitBreaker.getState().state).to.equal('CLOSED');
        });
    });

    describe('KMS Provider Adapters', () => {
        describe('Base Adapter', () => {
            let adapter;

            beforeEach(() => {
                adapter = new KMSProviderAdapter();
            });

            it('should throw errors for unimplemented methods', async () => {
                await expect(adapter.encrypt('key1', Buffer.from('test'))).to.be.rejectedWith('encrypt() must be implemented');
                await expect(adapter.decrypt('key1', Buffer.from('test'))).to.be.rejectedWith('decrypt() must be implemented');
                await expect(adapter.generateKey('key1')).to.be.rejectedWith('generateKey() must be implemented');
                await expect(adapter.healthCheck()).to.be.rejectedWith('healthCheck() must be implemented');
            });

            it('should perform envelope encryption', async () => {
                const mockProvider = {
                    encrypt: sinon.stub().resolves(Buffer.from('encrypted-dek')),
                    circuitBreaker: { execute: sinon.stub() }
                };
                mockProvider.circuitBreaker.execute.callsFake(async (fn) => fn());

                adapter.encrypt = mockProvider.encrypt;
                adapter.circuitBreaker = mockProvider.circuitBreaker;

                const dek = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
                const result = await adapter.envelopeEncrypt(dek, 'kek-1');

                expect(result).to.have.property('encryptedDataKey');
                expect(result).to.have.property('dataEncryptionKey');
                expect(result.keyId).to.equal('kek-1');
                expect(result.algorithm).to.equal('aes-256-gcm');
            });

            it('should perform envelope decryption', async () => {
                const mockProvider = {
                    decrypt: sinon.stub().resolves(Buffer.from('decrypted-dek')),
                    circuitBreaker: { execute: sinon.stub() }
                };
                mockProvider.circuitBreaker.execute.callsFake(async (fn) => fn());

                adapter.decrypt = mockProvider.decrypt;
                adapter.circuitBreaker = mockProvider.circuitBreaker;

                const envelope = {
                    encryptedDataKey: Buffer.from('encrypted'),
                    keyId: 'kek-1',
                    algorithm: 'aes-256-gcm'
                };

                const result = await adapter.envelopeDecrypt(envelope);

                expect(result).to.have.property('dataEncryptionKey');
                expect(result.keyId).to.equal('kek-1');
                expect(result.algorithm).to.equal('aes-256-gcm');
            });
        });

        describe('AWS KMS Adapter', () => {
            let awsAdapter;

            beforeEach(() => {
                awsAdapter = new AWSKMSAdapter({
                    region: 'us-east-1',
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret'
                });
            });

            it('should initialize with correct configuration', () => {
                expect(awsAdapter.providerName).to.equal('aws-kms');
                expect(awsAdapter.supportedAlgorithms).to.include('AES_256');
            });

            it('should support algorithm checking', () => {
                expect(awsAdapter.isAlgorithmSupported('AES_256')).to.be.true;
                expect(awsAdapter.isAlgorithmSupported('UNSUPPORTED')).to.be.false;
            });
        });

        describe('Azure Key Vault Adapter', () => {
            let azureAdapter;

            beforeEach(() => {
                azureAdapter = new AzureKeyVaultAdapter({
                    keyVaultUrl: 'https://test.vault.azure.net'
                });
            });

            it('should initialize with correct configuration', () => {
                expect(azureAdapter.providerName).to.equal('azure-keyvault');
                expect(azureAdapter.supportedAlgorithms).to.include('RSA-OAEP-256');
            });
        });

        describe('Google Cloud KMS Adapter', () => {
            let gcpAdapter;

            beforeEach(() => {
                gcpAdapter = new GoogleCloudKMSAdapter({
                    projectId: 'test-project',
                    location: 'us-central1'
                });
            });

            it('should initialize with correct configuration', () => {
                expect(gcpAdapter.providerName).to.equal('gcp-kms');
                expect(gcpAdapter.supportedAlgorithms).to.include('GOOGLE_SYMMETRIC_ENCRYPTION');
            });
        });
    });

    describe('KMS Integration Service', () => {
        describe('Provider Management', () => {
            it('should initialize with configured providers', () => {
                const providers = kmsService.listProviders();
                expect(providers).to.have.lengthOf(3);
                expect(providers).to.include('aws-kms');
                expect(providers).to.include('azure-keyvault');
                expect(providers).to.include('gcp-kms');
            });

            it('should return provider instances', () => {
                const awsProvider = kmsService.getProvider('aws-kms');
                expect(awsProvider).to.be.instanceOf(AWSKMSAdapter);

                const azureProvider = kmsService.getProvider('azure-keyvault');
                expect(azureProvider).to.be.instanceOf(AzureKeyVaultAdapter);

                const gcpProvider = kmsService.getProvider('gcp-kms');
                expect(gcpProvider).to.be.instanceOf(GoogleCloudKMSAdapter);
            });
        });

        describe('Encryption with Fallback', () => {
            it('should encrypt using first available provider', async () => {
                const testData = Buffer.from('test data');
                const encryptedData = Buffer.from('encrypted data');

                mockProviders['aws-kms'].encrypt.resolves(encryptedData);
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                const result = await kmsService.encrypt('test-key', testData);

                expect(result.ciphertext).to.equal(encryptedData);
                expect(result.provider).to.equal('aws-kms');
                expect(mockProviders['aws-kms'].encrypt.calledOnce).to.be.true;
            });

            it('should fallback to next provider on failure', async () => {
                const testData = Buffer.from('test data');
                const encryptedData = Buffer.from('encrypted data');

                mockProviders['aws-kms'].encrypt.rejects(new Error('AWS failed'));
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                mockProviders['azure-keyvault'].encrypt.resolves(encryptedData);
                mockProviders['azure-keyvault'].circuitBreaker.execute.callsFake(async (fn) => fn());

                const result = await kmsService.encrypt('test-key', testData);

                expect(result.ciphertext).to.equal(encryptedData);
                expect(result.provider).to.equal('azure-keyvault');
                expect(mockProviders['aws-kms'].encrypt.calledOnce).to.be.true;
                expect(mockProviders['azure-keyvault'].encrypt.calledOnce).to.be.true;
            });

            it('should fail if all providers fail', async () => {
                const testData = Buffer.from('test data');

                mockProviders['aws-kms'].encrypt.rejects(new Error('AWS failed'));
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                mockProviders['azure-keyvault'].encrypt.rejects(new Error('Azure failed'));
                mockProviders['azure-keyvault'].circuitBreaker.execute.callsFake(async (fn) => fn());

                mockProviders['gcp-kms'].encrypt.rejects(new Error('GCP failed'));
                mockProviders['gcp-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                await expect(kmsService.encrypt('test-key', testData))
                    .to.be.rejectedWith('All KMS providers failed');
            });
        });

        describe('Decryption with Fallback', () => {
            it('should decrypt using first available provider', async () => {
                const encryptedData = Buffer.from('encrypted data');
                const decryptedData = Buffer.from('decrypted data');

                mockProviders['aws-kms'].decrypt.resolves(decryptedData);
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                const result = await kmsService.decrypt('test-key', encryptedData);

                expect(result.plaintext).to.equal(decryptedData);
                expect(result.provider).to.equal('aws-kms');
            });

            it('should fallback to next provider on failure', async () => {
                const encryptedData = Buffer.from('encrypted data');
                const decryptedData = Buffer.from('decrypted data');

                mockProviders['aws-kms'].decrypt.rejects(new Error('AWS failed'));
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                mockProviders['azure-keyvault'].decrypt.resolves(decryptedData);
                mockProviders['azure-keyvault'].circuitBreaker.execute.callsFake(async (fn) => fn());

                const result = await kmsService.decrypt('test-key', encryptedData);

                expect(result.plaintext).to.equal(decryptedData);
                expect(result.provider).to.equal('azure-keyvault');
            });
        });

        describe('Envelope Encryption', () => {
            it('should perform envelope encryption with caching', async () => {
                const dek = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
                const encryptedDek = Buffer.from('encrypted-dek');

                mockProviders['aws-kms'].envelopeEncrypt.resolves({
                    encryptedDataKey: encryptedDek,
                    dataEncryptionKey: dek,
                    keyId: 'kek-1',
                    algorithm: 'aes-256-gcm'
                });
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                const result1 = await kmsService.envelopeEncrypt(dek, 'kek-1');
                const result2 = await kmsService.envelopeEncrypt(dek, 'kek-1');

                expect(result1.encryptedDataKey).to.equal(encryptedDek);
                expect(result1.keyId).to.equal('kek-1');
                expect(result2).to.equal(result1); // Should be cached
                expect(mockProviders['aws-kms'].envelopeEncrypt.calledOnce).to.be.true;
            });

            it('should perform envelope decryption with caching', async () => {
                const envelope = {
                    encryptedDataKey: Buffer.from('encrypted-dek'),
                    keyId: 'kek-1',
                    algorithm: 'aes-256-gcm'
                };
                const decryptedDek = Buffer.from('decrypted-dek');

                mockProviders['aws-kms'].envelopeDecrypt.resolves({
                    dataEncryptionKey: decryptedDek,
                    keyId: 'kek-1',
                    algorithm: 'aes-256-gcm'
                });
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                const result1 = await kmsService.envelopeDecrypt(envelope);
                const result2 = await kmsService.envelopeDecrypt(envelope);

                expect(result1.dataEncryptionKey).to.equal(decryptedDek);
                expect(result1.keyId).to.equal('kek-1');
                expect(result2).to.equal(result1); // Should be cached
                expect(mockProviders['aws-kms'].envelopeDecrypt.calledOnce).to.be.true;
            });

            it('should clear envelope cache', () => {
                kmsService.envelopeCache.set('test', 'value');
                expect(kmsService.envelopeCache.size).to.equal(1);

                kmsService.clearEnvelopeCache();
                expect(kmsService.envelopeCache.size).to.equal(0);
            });
        });

        describe('Key Generation', () => {
            it('should generate keys using first available provider', async () => {
                mockProviders['aws-kms'].generateKey.resolves('generated-key-id');
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                const result = await kmsService.generateKey('test-key');

                expect(result.keyId).to.equal('generated-key-id');
                expect(result.provider).to.equal('aws-kms');
            });
        });

        describe('Health Checks', () => {
            it('should perform health checks on all providers', async () => {
                mockProviders['aws-kms'].healthCheck.resolves({ status: 'healthy', provider: 'aws-kms' });
                mockProviders['azure-keyvault'].healthCheck.resolves({ status: 'healthy', provider: 'azure-keyvault' });
                mockProviders['gcp-kms'].healthCheck.resolves({ status: 'unhealthy', provider: 'gcp-kms', error: 'Connection failed' });

                const health = await kmsService.healthCheck();

                expect(health.overallStatus).to.equal('healthy');
                expect(health.healthyProviders).to.equal(2);
                expect(health.totalProviders).to.equal(3);
                expect(health.results['aws-kms'].status).to.equal('healthy');
                expect(health.results['azure-keyvault'].status).to.equal('healthy');
                expect(health.results['gcp-kms'].status).to.equal('unhealthy');
            });

            it('should report unhealthy when no providers available', async () => {
                mockProviders['aws-kms'].healthCheck.resolves({ status: 'unhealthy', provider: 'aws-kms' });
                mockProviders['azure-keyvault'].healthCheck.resolves({ status: 'unhealthy', provider: 'azure-keyvault' });
                mockProviders['gcp-kms'].healthCheck.resolves({ status: 'unhealthy', provider: 'gcp-kms' });

                const health = await kmsService.healthCheck();

                expect(health.overallStatus).to.equal('unhealthy');
                expect(health.healthyProviders).to.equal(0);
            });
        });

        describe('Audit Logging', () => {
            it('should log successful operations', async () => {
                mockProviders['aws-kms'].encrypt.resolves(Buffer.from('encrypted'));
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                await kmsService.encrypt('test-key', Buffer.from('test'));

                const auditLog = kmsService.getAuditLog();
                expect(auditLog).to.have.lengthOf(1);
                expect(auditLog[0].operation).to.equal('encrypt');
                expect(auditLog[0].provider).to.equal('aws-kms');
                expect(auditLog[0].status).to.equal('success');
            });

            it('should log failed operations', async () => {
                mockProviders['aws-kms'].encrypt.rejects(new Error('Test error'));
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                try {
                    await kmsService.encrypt('test-key', Buffer.from('test'));
                } catch (error) {
                    // Expected
                }

                const auditLog = kmsService.getAuditLog();
                expect(auditLog).to.have.lengthOf(1);
                expect(auditLog[0].operation).to.equal('encrypt');
                expect(auditLog[0].provider).to.equal('aws-kms');
                expect(auditLog[0].status).to.equal('failure');
                expect(auditLog[0].error).to.equal('Test error');
            });

            it('should limit audit log size', () => {
                // Add more than 1000 entries
                for (let i = 0; i < 1100; i++) {
                    kmsService.auditLog.push({
                        timestamp: new Date().toISOString(),
                        operation: 'test',
                        provider: 'test',
                        keyId: 'test',
                        status: 'success'
                    });
                }

                // Trigger audit log cleanup
                kmsService.logAudit('test', 'test', 'test', 'success');

                expect(kmsService.auditLog).to.have.lengthOf(1000);
            });
        });

        describe('Envelope Encryption with Real Data', () => {
            it('should encrypt and decrypt data using envelope encryption', async () => {
                const testData = Buffer.from('This is sensitive data that needs encryption');
                const dek = crypto.randomBytes(32); // AES-256 key

                // Mock envelope encryption
                const envelope = {
                    encryptedDataKey: Buffer.from('encrypted-dek'),
                    dataEncryptionKey: dek,
                    keyId: 'test-kek',
                    algorithm: 'aes-256-gcm'
                };

                mockProviders['aws-kms'].envelopeEncrypt.resolves(envelope);
                mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

                // Encrypt data with DEK
                const cipher = crypto.createCipher('aes-256-gcm', dek);
                let encrypted = cipher.update(testData);
                encrypted = Buffer.concat([encrypted, cipher.final()]);
                const authTag = cipher.getAuthTag();

                // Create envelope
                const createdEnvelope = await kmsService.envelopeEncrypt(dek, 'test-kek');

                expect(createdEnvelope).to.have.property('encryptedDataKey');
                expect(createdEnvelope).to.have.property('dataEncryptionKey');
                expect(createdEnvelope.keyId).to.equal('test-kek');
            });
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complex encryption workflow', async () => {
            // Generate a key
            mockProviders['aws-kms'].generateKey.resolves('generated-key-123');
            mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

            const keyResult = await kmsService.generateKey('test-key');
            expect(keyResult.keyId).to.equal('generated-key-123');

            // Encrypt data
            const testData = Buffer.from('sensitive data');
            const encryptedData = Buffer.from('encrypted data');

            mockProviders['aws-kms'].encrypt.resolves(encryptedData);
            const encryptResult = await kmsService.encrypt('generated-key-123', testData);
            expect(encryptResult.ciphertext).to.equal(encryptedData);

            // Decrypt data
            mockProviders['aws-kms'].decrypt.resolves(testData);
            const decryptResult = await kmsService.decrypt('generated-key-123', encryptedData);
            expect(decryptResult.plaintext).to.equal(testData);
        });

        it('should handle provider failover during operation', async () => {
            const testData = Buffer.from('test data');

            // AWS fails
            mockProviders['aws-kms'].encrypt.rejects(new Error('AWS region down'));
            mockProviders['aws-kms'].circuitBreaker.execute.callsFake(async (fn) => fn());

            // Azure succeeds
            const encryptedData = Buffer.from('encrypted by azure');
            mockProviders['azure-keyvault'].encrypt.resolves(encryptedData);
            mockProviders['azure-keyvault'].circuitBreaker.execute.callsFake(async (fn) => fn());

            const result = await kmsService.encrypt('test-key', testData);

            expect(result.provider).to.equal('azure-keyvault');
            expect(result.ciphertext).to.equal(encryptedData);

            // Verify audit log shows both attempts
            const auditLog = kmsService.getAuditLog(2);
            expect(auditLog).to.have.lengthOf(2);
            expect(auditLog[0].provider).to.equal('aws-kms');
            expect(auditLog[0].status).to.equal('failure');
            expect(auditLog[1].provider).to.equal('azure-keyvault');
            expect(auditLog[1].status).to.equal('success');
        });
    });
});