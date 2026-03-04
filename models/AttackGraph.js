const mongoose = require('mongoose');

/**
 * AttackGraph Model
 * Issue #907: Mapping paths an attacker could take to bypass policy nodes.
 * Stores identified vulnerabilities and potential exploit sequences.
 */
const AttackGraphSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    threatActorProfile: {
        type: String,
        enum: ['SOPHISTICATED_INSIDER', 'SCRIPT_KIDDIE', 'SALAMI_SLICER', 'BOTNET'],
        default: 'SALAMI_SLICER'
    },
    nodes: [{
        id: String, // PolicyNode ID or System Component
        type: { type: String, enum: ['POLICY_GATE', 'DATA_ENTRY', 'APPROVAL_POINT', 'BATCH_JOB'] },
        vulnerabilityLevel: { type: Number, min: 0, max: 1 }, // 1 = fully exploitable
        metadata: mongoose.Schema.Types.Mixed
    }],
    edges: [{
        from: String,
        to: String,
        exploitProbability: Number,
        bypassMethod: String // e.g., 'VALUE_SPLITTING', 'MIMICRY_ATTACK'
    }],
    criticalPath: [String], // Sequence of node IDs forming the highest risk path
    discoveredAt: { type: Date, default: Date.now },
    lastSimulatedAt: Date,
    status: { type: String, enum: ['ACTIVE', 'MUDDIED', 'MITIGATED'], default: 'ACTIVE' }
}, { timestamps: true });

module.exports = mongoose.model('AttackGraph', AttackGraphSchema);
