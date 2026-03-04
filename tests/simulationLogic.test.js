/**
 * Simulation Logic Tests - Issue #798
 * Statistical validity testing and deterministic chaos checks
 */

const MathSimulation = require('../utils/mathSimulation');

describe('MathSimulation', () => {
  describe('normalRandom', () => {
    it('should generate values around the mean', () => {
      const samples = Array(10000).fill(0).map(() => MathSimulation.normalRandom(100, 15));
      const mean = MathSimulation.mean(samples);
      
      // Mean should be close to 100 (within 1%)
      expect(Math.abs(mean - 100)).toBeLessThan(1);
    });

    it('should have correct standard deviation', () => {
      const samples = Array(10000).fill(0).map(() => MathSimulation.normalRandom(0, 10));
      const stdDev = MathSimulation.stdDev(samples);
      
      // StdDev should be close to 10 (within 5%)
      expect(Math.abs(stdDev - 10)).toBeLessThan(0.5);
    });
  });

  describe('logNormalRandom', () => {
    it('should always return positive values', () => {
      const samples = Array(1000).fill(0).map(() => MathSimulation.logNormalRandom(0, 0.5));
      const allPositive = samples.every(s => s > 0);
      
      expect(allPositive).toBe(true);
    });

    it('should be right-skewed', () => {
      const samples = Array(10000).fill(0).map(() => MathSimulation.logNormalRandom(0, 0.5));
      const skewness = MathSimulation.skewness(samples);
      
      // Log-normal should be positively skewed
      expect(skewness).toBeGreaterThan(0);
    });
  });

  describe('poissonRandom', () => {
    it('should have mean approximately equal to lambda', () => {
      const lambda = 5;
      const samples = Array(10000).fill(0).map(() => MathSimulation.poissonRandom(lambda));
      const mean = MathSimulation.mean(samples);
      
      expect(Math.abs(mean - lambda)).toBeLessThan(0.2);
    });

    it('should only return non-negative integers', () => {
      const samples = Array(1000).fill(0).map(() => MathSimulation.poissonRandom(3));
      const allValid = samples.every(s => Number.isInteger(s) && s >= 0);
      
      expect(allValid).toBe(true);
    });
  });

  describe('triangularRandom', () => {
    it('should return values within bounds', () => {
      const min = 10, mode = 50, max = 100;
      const samples = Array(1000).fill(0).map(() => 
        MathSimulation.triangularRandom(min, mode, max)
      );
      
      const allInBounds = samples.every(s => s >= min && s <= max);
      expect(allInBounds).toBe(true);
    });

    it('should cluster around the mode', () => {
      const min = 0, mode = 80, max = 100;
      const samples = Array(10000).fill(0).map(() => 
        MathSimulation.triangularRandom(min, mode, max)
      );
      const mean = MathSimulation.mean(samples);
      
      // Mean of triangular is (min + mode + max) / 3
      const expectedMean = (min + mode + max) / 3;
      expect(Math.abs(mean - expectedMean)).toBeLessThan(2);
    });
  });

  describe('percentile', () => {
    it('should return correct percentile values', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      expect(MathSimulation.percentile(data, 0)).toBe(1);
      expect(MathSimulation.percentile(data, 50)).toBe(5.5);
      expect(MathSimulation.percentile(data, 100)).toBe(10);
    });

    it('should handle empty arrays', () => {
      expect(MathSimulation.percentile([], 50)).toBe(0);
    });
  });

  describe('mean', () => {
    it('should calculate correct mean', () => {
      expect(MathSimulation.mean([1, 2, 3, 4, 5])).toBe(3);
      expect(MathSimulation.mean([10, 20, 30])).toBe(20);
    });

    it('should handle empty arrays', () => {
      expect(MathSimulation.mean([])).toBe(0);
    });
  });

  describe('stdDev', () => {
    it('should calculate correct standard deviation', () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9];
      const stdDev = MathSimulation.stdDev(data);
      
      // Expected stdDev is 2
      expect(Math.abs(stdDev - 2)).toBeLessThan(0.1);
    });

    it('should return 0 for single element', () => {
      expect(MathSimulation.stdDev([5])).toBe(0);
    });
  });

  describe('gbmStep', () => {
    it('should model price movement with drift', () => {
      const initialValue = 100;
      const drift = 0.0001; // Small positive drift
      const volatility = 0.02;
      
      // Run many simulations and check average moves up
      const finalValues = Array(10000).fill(0).map(() => {
        let value = initialValue;
        for (let i = 0; i < 100; i++) {
          value = MathSimulation.gbmStep(value, drift, volatility);
        }
        return value;
      });
      
      const avgFinal = MathSimulation.mean(finalValues);
      // With positive drift, average should be above initial
      expect(avgFinal).toBeGreaterThan(initialValue);
    });

    it('should never return negative values', () => {
      const samples = Array(1000).fill(0).map(() => 
        MathSimulation.gbmStep(100, -0.01, 0.3)
      );
      
      const allPositive = samples.every(s => s > 0);
      expect(allPositive).toBe(true);
    });
  });

  describe('valueAtRisk', () => {
    it('should return correct VaR', () => {
      // Create synthetic returns
      const returns = Array(1000).fill(0).map(() => 
        MathSimulation.normalRandom(0, 10)
      );
      
      const var95 = MathSimulation.valueAtRisk(returns, 95);
      
      // 5% of values should be below VaR
      const belowVaR = returns.filter(r => r <= var95).length / returns.length;
      expect(Math.abs(belowVaR - 0.05)).toBeLessThan(0.02);
    });
  });

  describe('conditionalVaR', () => {
    it('should be more extreme than VaR', () => {
      const returns = Array(1000).fill(0).map(() => 
        MathSimulation.normalRandom(0, 10)
      );
      
      const var95 = MathSimulation.valueAtRisk(returns, 95);
      const cvar95 = MathSimulation.conditionalVaR(returns, 95);
      
      // CVaR should be more negative (worse) than VaR
      expect(cvar95).toBeLessThanOrEqual(var95);
    });
  });

  describe('histogram', () => {
    it('should create correct number of bins', () => {
      const data = Array(100).fill(0).map((_, i) => i);
      const hist = MathSimulation.histogram(data, 10);
      
      expect(hist.length).toBe(10);
    });

    it('should sum frequencies to 1', () => {
      const data = Array(1000).fill(0).map(() => Math.random() * 100);
      const hist = MathSimulation.histogram(data, 20);
      
      const totalFrequency = hist.reduce((sum, bin) => sum + bin.frequency, 0);
      expect(Math.abs(totalFrequency - 1)).toBeLessThan(0.01);
    });

    it('should handle empty arrays', () => {
      const hist = MathSimulation.histogram([], 10);
      expect(hist).toEqual([]);
    });
  });

  describe('correlatedNormals', () => {
    it('should generate correlated pairs', () => {
      const correlation = 0.8;
      const pairs = Array(10000).fill(0).map(() => 
        MathSimulation.correlatedNormals(correlation)
      );
      
      const x = pairs.map(p => p[0]);
      const y = pairs.map(p => p[1]);
      
      // Calculate empirical correlation
      const meanX = MathSimulation.mean(x);
      const meanY = MathSimulation.mean(y);
      const stdX = MathSimulation.stdDev(x);
      const stdY = MathSimulation.stdDev(y);
      
      const covariance = pairs.reduce((sum, [xi, yi]) => 
        sum + (xi - meanX) * (yi - meanY), 0
      ) / pairs.length;
      
      const empiricalCorr = covariance / (stdX * stdY);
      
      expect(Math.abs(empiricalCorr - correlation)).toBeLessThan(0.05);
    });

    it('should work with negative correlation', () => {
      const correlation = -0.5;
      const pairs = Array(5000).fill(0).map(() => 
        MathSimulation.correlatedNormals(correlation)
      );
      
      const x = pairs.map(p => p[0]);
      const y = pairs.map(p => p[1]);
      
      const meanX = MathSimulation.mean(x);
      const meanY = MathSimulation.mean(y);
      const stdX = MathSimulation.stdDev(x);
      const stdY = MathSimulation.stdDev(y);
      
      const covariance = pairs.reduce((sum, [xi, yi]) => 
        sum + (xi - meanX) * (yi - meanY), 0
      ) / pairs.length;
      
      const empiricalCorr = covariance / (stdX * stdY);
      
      // Should be negative
      expect(empiricalCorr).toBeLessThan(0);
    });
  });

  describe('randomShock', () => {
    it('should return 0 most of the time with low probability', () => {
      const shocks = Array(1000).fill(0).map(() => 
        MathSimulation.randomShock(0.01, 100, 200)
      );
      
      const zeroCount = shocks.filter(s => s === 0).length;
      expect(zeroCount).toBeGreaterThan(980);
    });

    it('should return values in range when shock occurs', () => {
      const shocks = Array(10000).fill(0).map(() => 
        MathSimulation.randomShock(1, 100, 200) // 100% probability
      );
      
      const allInRange = shocks.every(s => s >= 100 && s <= 200);
      expect(allInRange).toBe(true);
    });
  });

  describe('seededRandom', () => {
    it('should produce deterministic results', () => {
      const random1 = MathSimulation.seededRandom(12345);
      const random2 = MathSimulation.seededRandom(12345);
      
      const seq1 = Array(10).fill(0).map(() => random1());
      const seq2 = Array(10).fill(0).map(() => random2());
      
      expect(seq1).toEqual(seq2);
    });

    it('should produce different sequences for different seeds', () => {
      const random1 = MathSimulation.seededRandom(12345);
      const random2 = MathSimulation.seededRandom(54321);
      
      const seq1 = Array(10).fill(0).map(() => random1());
      const seq2 = Array(10).fill(0).map(() => random2());
      
      expect(seq1).not.toEqual(seq2);
    });
  });
});

describe('Monte Carlo Simulation Integration', () => {
  describe('Deterministic Chaos Checks', () => {
    it('should produce consistent distribution properties across runs', () => {
      // Run the same simulation setup twice
      const runSimulation = () => {
        const results = Array(5000).fill(0).map(() => {
          let balance = 10000;
          for (let day = 0; day < 30; day++) {
            const income = Math.max(0, MathSimulation.normalRandom(100, 20));
            const expense = Math.max(0, MathSimulation.normalRandom(120, 30));
            balance += income - expense;
          }
          return balance;
        });
        
        return {
          mean: MathSimulation.mean(results),
          stdDev: MathSimulation.stdDev(results),
          p10: MathSimulation.percentile([...results].sort((a, b) => a - b), 10),
          p90: MathSimulation.percentile([...results].sort((a, b) => a - b), 90)
        };
      };

      const run1 = runSimulation();
      const run2 = runSimulation();
      
      // Means should be similar (within 5%)
      expect(Math.abs(run1.mean - run2.mean) / run1.mean).toBeLessThan(0.05);
      
      // StdDevs should be similar (within 10%)
      expect(Math.abs(run1.stdDev - run2.stdDev) / run1.stdDev).toBeLessThan(0.1);
    });

    it('should show sensitivity to initial conditions', () => {
      // Small change in starting balance should lead to proportional change in outcomes
      const simulate = (startBalance) => {
        const results = Array(1000).fill(0).map(() => {
          let balance = startBalance;
          for (let day = 0; day < 30; day++) {
            balance += MathSimulation.normalRandom(-10, 50);
          }
          return balance;
        });
        return MathSimulation.mean(results);
      };

      const result1 = simulate(10000);
      const result2 = simulate(11000);
      
      // Expected difference should be approximately 1000
      const diff = result2 - result1;
      expect(Math.abs(diff - 1000)).toBeLessThan(200);
    });
  });

  describe('Statistical Validity', () => {
    it('should produce normally distributed final balances', () => {
      const results = Array(10000).fill(0).map(() => {
        let balance = 10000;
        for (let day = 0; day < 30; day++) {
          balance += MathSimulation.normalRandom(0, 50);
        }
        return balance;
      });
      
      // Check that skewness is close to 0 (normal distribution)
      const skewness = MathSimulation.skewness(results);
      expect(Math.abs(skewness)).toBeLessThan(0.1);
    });

    it('should have P50 close to mean for symmetric distributions', () => {
      const results = Array(5000).fill(0).map(() => 
        MathSimulation.normalRandom(1000, 100)
      );
      
      const mean = MathSimulation.mean(results);
      const p50 = MathSimulation.percentile([...results].sort((a, b) => a - b), 50);
      
      expect(Math.abs(mean - p50)).toBeLessThan(10);
    });

    it('should correctly identify tail risk', () => {
      // Simulate with occasional large shocks
      const results = Array(10000).fill(0).map(() => {
        let balance = 10000;
        for (let day = 0; day < 30; day++) {
          balance += MathSimulation.normalRandom(0, 50);
          // 5% chance of 500 shock
          if (Math.random() < 0.05) {
            balance -= 500;
          }
        }
        return balance;
      });

      const var95 = MathSimulation.valueAtRisk(results, 95);
      const cvar95 = MathSimulation.conditionalVaR(results, 95);
      
      // CVaR should capture the tail risk better
      expect(cvar95).toBeLessThan(var95);
      
      // Both should be less than mean
      expect(var95).toBeLessThan(MathSimulation.mean(results));
    });
  });
});
