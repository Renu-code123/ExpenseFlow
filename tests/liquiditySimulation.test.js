const SimulationEngine = require('../services/simulationEngine');
const MonteCarloMath = require('../utils/monteCarloMath');
const CashFlowRepository = require('../repositories/cashFlowRepository');
const TreasuryNode = require('../models/TreasuryNode');
const LiquidityForecast = require('../models/LiquidityForecast');
const mongoose = require('mongoose');

jest.mock('../repositories/cashFlowRepository');
jest.mock('../models/TreasuryNode');
jest.mock('../models/LiquidityForecast');

describe('Liquidity Prophet - Monte Carlo Simulation Engine', () => {
    const mockWorkspaceId = new mongoose.Types.ObjectId().toString();
    const mockNodeId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('MonteCarloMath', () => {
        test('sampleNormal should return numbers following normal distribution', () => {
            const samples = [];
            for (let i = 0; i < 1000; i++) {
                samples.push(MonteCarloMath.sampleNormal(100, 10));
            }
            const mean = samples.reduce((a, b) => a + b) / samples.length;
            expect(mean).toBeCloseTo(100, 0);
        });

        test('simulatePath should generate non-negative paths for positive drift', () => {
            const path = MonteCarloMath.simulatePath(1000, 0.01, 0.05, 30);
            expect(path.length).toBe(31);
            expect(path[30]).toBeGreaterThan(0);
        });
    });

    describe('SimulationEngine', () => {
        test('runWorkspaceSimulation should calculate insolvency risk correctly', async () => {
            CashFlowRepository.getSpendVelocity.mockResolvedValue({
                drift: -0.05, // Rapid decline
                volatility: 0.2,
                averageDailySpend: 500
            });

            TreasuryNode.findById.mockResolvedValue({
                _id: mockNodeId,
                balance: 1000 // Only 2 days of runway at 500/day
            });

            LiquidityForecast.create.mockImplementation(data => data);

            const result = await SimulationEngine.runWorkspaceSimulation(mockWorkspaceId, mockNodeId, 10);

            expect(result.projections.length).toBe(11);
            // On day 10, with drift -0.05 and balance 1000, insolvency risk should be high
            expect(result.projections[10].insolvencyRisk).toBeGreaterThan(0.5);
        });

        test('identifySpendWindows should select low risk periods', () => {
            const mockProjections = [
                { date: new Date(1), insolvencyRisk: 0.01, p10: 5000 },
                { date: new Date(2), insolvencyRisk: 0.01, p10: 5000 },
                { date: new Date(3), insolvencyRisk: 0.30, p10: 500 } // High risk
            ];

            const windows = SimulationEngine.identifySpendWindows(mockProjections);
            expect(windows.length).toBe(1);
            expect(windows[0].reason).toBe('High liquidity confidence window');
        });
    });
});
