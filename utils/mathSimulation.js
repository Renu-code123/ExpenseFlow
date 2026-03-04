/**
 * Math Simulation Utilities - Issue #798
 * Statistical samplers and probability distribution functions
 * for Monte Carlo cashflow simulations
 */

class MathSimulation {
  /**
   * Generate a random number from a normal (Gaussian) distribution
   * Using Box-Muller transform
   * @param {number} mean - Mean of the distribution
   * @param {number} stdDev - Standard deviation
   * @returns {number} Random sample
   */
  static normalRandom(mean = 0, stdDev = 1) {
    let u1, u2;
    do {
      u1 = Math.random();
      u2 = Math.random();
    } while (u1 === 0);

    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * Generate a random number from a log-normal distribution
   * Useful for modeling financial returns and expenses
   * @param {number} mu - Mean of underlying normal
   * @param {number} sigma - Std dev of underlying normal
   * @returns {number} Random sample
   */
  static logNormalRandom(mu, sigma) {
    const normal = this.normalRandom(mu, sigma);
    return Math.exp(normal);
  }

  /**
   * Generate a random number from exponential distribution
   * Useful for modeling time between events (expense shocks)
   * @param {number} lambda - Rate parameter
   * @returns {number} Random sample
   */
  static exponentialRandom(lambda) {
    return -Math.log(1 - Math.random()) / lambda;
  }

  /**
   * Generate a random number from a Poisson distribution
   * Useful for modeling number of expense events
   * @param {number} lambda - Expected number of events
   * @returns {number} Random integer sample
   */
  static poissonRandom(lambda) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;

    do {
      k++;
      p *= Math.random();
    } while (p > L);

    return k - 1;
  }

  /**
   * Generate a random number from uniform distribution
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Random sample
   */
  static uniformRandom(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Generate a random number from triangular distribution
   * Useful for expert estimates (pessimistic, most likely, optimistic)
   * @param {number} min - Minimum value
   * @param {number} mode - Most likely value
   * @param {number} max - Maximum value
   * @returns {number} Random sample
   */
  static triangularRandom(min, mode, max) {
    const u = Math.random();
    const fc = (mode - min) / (max - min);

    if (u < fc) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }

  /**
   * Calculate percentile from sorted array
   * @param {number[]} sortedArray - Sorted array of values
   * @param {number} percentile - Percentile (0-100)
   * @returns {number} Value at percentile
   */
  static percentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sortedArray[lower];
    
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Calculate mean of an array
   * @param {number[]} arr - Array of numbers
   * @returns {number} Mean
   */
  static mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Calculate standard deviation of an array
   * @param {number[]} arr - Array of numbers
   * @returns {number} Standard deviation
   */
  static stdDev(arr) {
    if (arr.length < 2) return 0;
    const avg = this.mean(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  /**
   * Calculate coefficient of variation
   * @param {number[]} arr - Array of numbers
   * @returns {number} CV (stdDev / mean)
   */
  static coefficientOfVariation(arr) {
    const avg = this.mean(arr);
    if (avg === 0) return 0;
    return this.stdDev(arr) / Math.abs(avg);
  }

  /**
   * Calculate skewness of distribution
   * @param {number[]} arr - Array of numbers
   * @returns {number} Skewness coefficient
   */
  static skewness(arr) {
    if (arr.length < 3) return 0;
    const n = arr.length;
    const avg = this.mean(arr);
    const std = this.stdDev(arr);
    if (std === 0) return 0;

    const cubed = arr.map(x => Math.pow((x - avg) / std, 3));
    return (n / ((n - 1) * (n - 2))) * cubed.reduce((a, b) => a + b, 0);
  }

  /**
   * Geometric Brownian Motion step
   * Models asset prices and cashflow with drift and volatility
   * @param {number} currentValue - Current value
   * @param {number} drift - Expected daily return (mu)
   * @param {number} volatility - Daily volatility (sigma)
   * @param {number} dt - Time step (default 1 day)
   * @returns {number} Next value
   */
  static gbmStep(currentValue, drift, volatility, dt = 1) {
    const randomShock = this.normalRandom(0, 1);
    const driftComponent = drift * dt;
    const volatilityComponent = volatility * Math.sqrt(dt) * randomShock;
    return currentValue * Math.exp(driftComponent + volatilityComponent);
  }

  /**
   * Generate correlated random numbers
   * @param {number} correlation - Correlation coefficient (-1 to 1)
   * @returns {number[]} Two correlated random numbers
   */
  static correlatedNormals(correlation) {
    const z1 = this.normalRandom();
    const z2 = this.normalRandom();
    const y1 = z1;
    const y2 = correlation * z1 + Math.sqrt(1 - correlation * correlation) * z2;
    return [y1, y2];
  }

  /**
   * Calculate Value at Risk (VaR)
   * @param {number[]} returns - Array of returns/outcomes
   * @param {number} confidenceLevel - e.g., 95 for 95%
   * @returns {number} VaR value
   */
  static valueAtRisk(returns, confidenceLevel = 95) {
    const sorted = [...returns].sort((a, b) => a - b);
    return this.percentile(sorted, 100 - confidenceLevel);
  }

  /**
   * Calculate Conditional VaR (Expected Shortfall)
   * Average of losses beyond VaR
   * @param {number[]} returns - Array of returns/outcomes
   * @param {number} confidenceLevel - e.g., 95 for 95%
   * @returns {number} CVaR value
   */
  static conditionalVaR(returns, confidenceLevel = 95) {
    const var_ = this.valueAtRisk(returns, confidenceLevel);
    const tailLosses = returns.filter(r => r <= var_);
    return tailLosses.length > 0 ? this.mean(tailLosses) : var_;
  }

  /**
   * Generate a random shock event based on probability
   * @param {number} probability - Probability of shock (0-1)
   * @param {number} minImpact - Minimum shock magnitude
   * @param {number} maxImpact - Maximum shock magnitude
   * @returns {number} Shock amount (0 if no shock occurs)
   */
  static randomShock(probability, minImpact, maxImpact) {
    if (Math.random() < probability) {
      return this.uniformRandom(minImpact, maxImpact);
    }
    return 0;
  }

  /**
   * Set seed for reproducible results (pseudo-implementation)
   * Note: JavaScript's Math.random() doesn't support seeding natively
   * This uses a simple Linear Congruential Generator for testing
   * @param {number} seed - Seed value
   * @returns {function} Seeded random function
   */
  static seededRandom(seed) {
    let state = seed;
    return function() {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /**
   * Calculate histogram bins for visualization
   * @param {number[]} data - Array of values
   * @param {number} numBins - Number of bins
   * @returns {Object[]} Array of bin objects {min, max, count, frequency}
   */
  static histogram(data, numBins = 20) {
    if (data.length === 0) return [];

    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / numBins;

    const bins = Array(numBins).fill(0).map((_, i) => ({
      min: min + i * binWidth,
      max: min + (i + 1) * binWidth,
      count: 0,
      frequency: 0
    }));

    data.forEach(value => {
      const binIndex = Math.min(
        Math.floor((value - min) / binWidth),
        numBins - 1
      );
      bins[binIndex].count++;
    });

    bins.forEach(bin => {
      bin.frequency = bin.count / data.length;
    });

    return bins;
  }
}

module.exports = MathSimulation;
