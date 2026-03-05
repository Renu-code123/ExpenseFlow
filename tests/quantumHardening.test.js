const LatticeMath = require('../utils/latticeMath');
const pqcSignatureService = require('../services/pqcSignatureService');
const ledgerRepository = require('../repositories/ledgerRepository');
const QuantumAnchor = require('../models/QuantumAnchor');
const mongoose = require('mongoose');

jest.mock('../models/QuantumAnchor');

describe('Quantum Hardening - PQC Ledger Anchoring', () => {
    const mockShardId = 'shard_2026_test';

    test('LatticeMath should detect tampered state roots', () => {
        const events = [
            { sequence: 101, currentHash: 'hash1' },
            { sequence: 102, currentHash: 'hash2' }
        ];

        const root1 = LatticeMath.computeStateRoot(events);

        // Tamper with an event
        events[0].currentHash = 'tampered_hash';
        const root2 = LatticeMath.computeStateRoot(events);

        expect(root1).not.toBe(root2);
    });

    test('PqcSignatureService should verify valid lattice signatures', async () => {
        const rootHash = 'abc123stateRoot';
        const anchor = {
            stateRoot: rootHash,
            pqcSignature: await pqcSignatureService.signRoot(rootHash)
        };

        const isValid = await pqcSignatureService.verifyAnchor(anchor);
        expect(isValid).toBe(true);
    });

    test('ledgerRepository.verifyQuantumAnchors should return false on mismatched roots', async () => {
        const events = [{ sequence: 1, currentHash: 'h1' }];
        const correctRoot = LatticeMath.computeStateRoot(events);
        const wrongRoot = 'wrong_root_hash';

        const mockSignature = await pqcSignatureService.signRoot(correctRoot);

        // Mock anchor with correct signature but we'll test against wrong events
        QuantumAnchor.findOne.mockReturnValue({
            sort: () => ({
                lean: () => ({
                    stateRoot: correctRoot,
                    pqcSignature: mockSignature
                }),
                exec: () => Promise.resolve({
                    stateRoot: correctRoot,
                    pqcSignature: mockSignature
                })
            })
        });

        // Simulating the actual DB call return
        QuantumAnchor.findOne.mockImplementation(() => ({
            sort: () => Promise.resolve({
                stateRoot: correctRoot,
                pqcSignature: mockSignature
            })
        }));

        const tamperedEvents = [{ sequence: 1, currentHash: 'h1_tampered' }];
        const isVerified = await ledgerRepository.verifyQuantumAnchors(mockShardId, tamperedEvents);

        expect(isVerified).toBe(false);
    });
});
