const treasuryRepository = require('../repositories/treasuryRepository');
const jitFundingOrchestrator = require('../services/jitFundingOrchestrator');
const RebalancePlan = require('../models/RebalancePlan');
const mongoose = require('mongoose');

describe('JIT Funding & Capital Efficiency - Race Condition simulation', () => {
    const mockWorkspaceId = new mongoose.Types.ObjectId();
    const sourceNodeId = new mongoose.Types.ObjectId();
    const targetNodeId = new mongoose.Types.ObjectId();

    test('atomicTransfer should prevent double-pull when balance is low', async () => {
        // Mock findOneAndUpdate to fail second call
        const mockFindUpdate = jest.spyOn(treasuryRepository.model, 'findOneAndUpdate')
            .mockResolvedValueOnce({ _id: sourceNodeId, balance: 100 }) // First succeeds
            .mockResolvedValueOnce(null); // Second fails (insufficient funds)

        const amount = 80;

        // Try two simultaneous transfers
        const t1 = treasuryRepository.atomicTransfer(sourceNodeId, targetNodeId, amount);
        const t2 = treasuryRepository.atomicTransfer(sourceNodeId, targetNodeId, amount);

        const results = await Promise.allSettled([t1, t2]);

        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        expect(results[1].reason.message).toBe('Insufficient funds in source node for atomic transfer');
    });

    test('Orchestrator should only execute plans within their window', async () => {
        const now = new Date();
        const futurePlan = await RebalancePlan.create({
            workspaceId: mockWorkspaceId,
            sourceNodeId,
            targetNodeId,
            amount: 500,
            triggerType: 'FORECAST_PROjection',
            executionWindow: {
                start: new Date(now.getTime() + 3600000), // 1 hour from now
                end: new Date(now.getTime() + 7200000)
            }
        });

        const activePlan = await RebalancePlan.create({
            workspaceId: mockWorkspaceId,
            sourceNodeId,
            targetNodeId,
            amount: 300,
            triggerType: 'REAL_TIME_GUARD',
            executionWindow: {
                start: new Date(now.getTime() - 60000), // 1 min ago
                end: new Date(now.getTime() + 300000)
            }
        });

        // Mock executePlan to just change status
        const executeSpy = jest.spyOn(jitFundingOrchestrator, 'executePlan').mockImplementation(async (plan) => {
            plan.status = 'EXECUTED';
            await plan.save();
        });

        await jitFundingOrchestrator.processPendingPlans();

        const updatedFuture = await RebalancePlan.findById(futurePlan._id);
        const updatedActive = await RebalancePlan.findById(activePlan._id);

        expect(updatedFuture.status).toBe('PENDING');
        expect(updatedActive.status).toBe('EXECUTED');
    });
});
