const cron = require('node-cron');
const ForecastScenario = require('../models/ForecastScenario');
const forecastingEngine = require('../services/forecastingEngine');

/**
 * Forecast Retrainer Job
 * Issue #678: Periodically updates cash-flow projections for default scenarios.
 */
class ForecastRetrainer {
    constructor() {
        this.name = 'ForecastRetrainer';
    }

    /**
     * Start the background retraining cycle
     */
    start() {
        console.log(`[${this.name}] Initializing stochastic simulation worker...`);

        // Run every Sunday at 3:00 AM
        cron.schedule('0 3 * * 0', async () => {
            try {
                console.log(`[${this.name}] Starting predictive retraining...`);

                const scenarios = await ForecastScenario.find({ isDefault: true }).populate('user');
                let count = 0;

                for (const scenario of scenarios) {
                    await forecastingEngine.runSimulation(scenario.user._id, scenario);
                    count++;
                }

                console.log(`[${this.name}] Successfully updated ${count} baseline simulations.`);
            } catch (error) {
                console.error(`[${this.name}] Retraining error:`, error);
            }
        });
    }
}

module.exports = new ForecastRetrainer();
