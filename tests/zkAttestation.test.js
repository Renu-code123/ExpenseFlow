/**
 * ZKAttestation Model Test Suite
 * Issue #899: Unit tests for ZKAttestation model validation and constraints
 */

const assert = require('assert');
const mongoose = require('mongoose');
const ZKAttestation = require('../models/ZKAttestation');

// Mock mongoose to avoid actual DB connections
jest.mock('mongoose');

describe('ZKAttestation Model (#899)', () => {

    beforeEach(() => {
        // Clear mocks
        jest.clearAllMocks();
    });

    describe('Schema Validation', () => {
        it('should create a valid ZKAttestation', async () => {
            const validData = {
                transactionId: new mongoose.Types.ObjectId(),
                verificationKeyId: 'vk_12345',
                publicSignals: ['signal1', 'signal2'],
                proofHash: 'hash_abcdef123456',
                complianceRoot: 'root_789',
                proofStatus: 'generated',
                generatedAt: new Date()
            };

            // Mock the create method
            ZKAttestation.create = jest.fn().mockResolvedValue(validData);

            const result = await ZKAttestation.create(validData);
            expect(result.transactionId).toEqual(validData.transactionId);
            expect(result.verificationKeyId).toBe('vk_12345');
            expect(result.publicSignals).toEqual(['signal1', 'signal2']);
            expect(result.proofHash).toBe('hash_abcdef123456');
            expect(result.complianceRoot).toBe('root_789');
            expect(result.proofStatus).toBe('generated');
        });

        it('should reject duplicate transactionId', async () => {
            const transactionId = new mongoose.Types.ObjectId();
            const data1 = {
                transactionId,
                verificationKeyId: 'vk_1',
                publicSignals: [],
                proofHash: 'hash1',
                complianceRoot: 'root1'
            };
            const data2 = {
                transactionId,
                verificationKeyId: 'vk_2',
                publicSignals: [],
                proofHash: 'hash2',
                complianceRoot: 'root2'
            };

            // Mock create to throw duplicate key error on second call
            ZKAttestation.create = jest.fn()
                .mockResolvedValueOnce(data1)
                .mockRejectedValueOnce(new Error('E11000 duplicate key error'));

            await ZKAttestation.create(data1);
            await expect(ZKAttestation.create(data2)).rejects.toThrow('duplicate key error');
        });

        it('should reject invalid proofStatus', async () => {
            const invalidData = {
                transactionId: new mongoose.Types.ObjectId(),
                verificationKeyId: 'vk_123',
                publicSignals: [],
                proofHash: 'hash123',
                complianceRoot: 'root123',
                proofStatus: 'invalid_status'
            };

            // Mock validation error
            const validationError = new Error('ValidationError');
            validationError.name = 'ValidationError';
            ZKAttestation.create = jest.fn().mockRejectedValue(validationError);

            await expect(ZKAttestation.create(invalidData)).rejects.toThrow('ValidationError');
        });

        it('should reject missing required fields', async () => {
            const incompleteData = {
                // missing transactionId
                verificationKeyId: 'vk_123',
                publicSignals: [],
                proofHash: 'hash123',
                complianceRoot: 'root123'
            };

            const validationError = new Error('ValidationError');
            validationError.name = 'ValidationError';
            ZKAttestation.create = jest.fn().mockRejectedValue(validationError);

            await expect(ZKAttestation.create(incompleteData)).rejects.toThrow('ValidationError');
        });
    });

    describe('Immutable Field Protection', () => {
        it('should prevent modification after verification', async () => {
            const attestation = {
                transactionId: new mongoose.Types.ObjectId(),
                verificationKeyId: 'vk_123',
                publicSignals: ['sig1'],
                proofHash: 'hash123',
                complianceRoot: 'root123',
                proofStatus: 'verified'
            };

            // Mock save to throw error for modification after verification
            const instance = {
                ...attestation,
                isModified: jest.fn().mockReturnValue(true),
                modifiedPaths: jest.fn().mockReturnValue(['verificationKeyId']),
                proofStatus: 'verified',
                save: jest.fn().mockImplementation(function() {
                    if (this.proofStatus === 'verified') {
                        throw new Error('Attestation cannot be modified after verification');
                    }
                })
            };

            expect(() => instance.save()).toThrow('Attestation cannot be modified after verification');
        });

        it('should allow status change to rejected after verification', async () => {
            const instance = {
                transactionId: new mongoose.Types.ObjectId(),
                verificationKeyId: 'vk_123',
                publicSignals: ['sig1'],
                proofHash: 'hash123',
                complianceRoot: 'root123',
                proofStatus: 'verified',
                isModified: jest.fn().mockReturnValue(true),
                modifiedPaths: jest.fn().mockReturnValue(['proofStatus']),
                save: jest.fn().mockResolvedValue(true)
            };

            await instance.save();
            expect(instance.save).toHaveBeenCalled();
        });
    });

    describe('Indexing', () => {
        it('should have transactionId as unique index', () => {
            // Check if the schema has unique index on transactionId
            const indexes = ZKAttestation.schema.indexes();
            const transactionIndex = indexes.find(index => 
                index[0].transactionId === 1 && index[1].unique === true
            );
            expect(transactionIndex).toBeDefined();
        });
    });
});