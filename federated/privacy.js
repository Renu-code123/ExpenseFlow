// Privacy-Preserving Mechanisms
// Differential privacy, secure aggregation

function applyDifferentialPrivacy(model) {
    // Add Gaussian noise to model weights for privacy
    const noiseLevel = 0.01;
    let noisyModel = {};
    for (const key in model) {
        if (typeof model[key] === 'number') {
            noisyModel[key] = model[key] + gaussianNoise(0, noiseLevel);
        } else {
            noisyModel[key] = model[key];
        }
    }
    return noisyModel;
}

function gaussianNoise(mean, std) {
    // Box-Muller transform
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) + mean;
}

function secureAggregate(models) {
    // Simple averaging for demonstration
    if (models.length === 0) return {};
    let agg = {};
    let keys = Object.keys(models[0]);
    for (const key of keys) {
        agg[key] = models.reduce((sum, m) => sum + (m[key] || 0), 0) / models.length;
    }
    return agg;
}

module.exports = {
    applyDifferentialPrivacy,
    secureAggregate
};
