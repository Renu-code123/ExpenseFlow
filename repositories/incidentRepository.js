const mongoose = require('mongoose');

/**
 * DetectionIncident Model
 * Issue #907: Storing "Detection-Failures" where adversarial attacks bypassed guards.
 */
const IncidentSchema = new mongoose.Schema({
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true },
    type: { type: String, enum: ['ADVERSARIAL_BYPASS', 'REAL_FRAUD', 'FALSE_POSITIVE'] },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    attackVector: String,
    transactionIds: [mongoose.Schema.Types.ObjectId],
    bypassedNodes: [String], // IDs of PolicyNodes that failed to catch the incident
    discoveryMethod: { type: String, enum: ['RED_TEAM_AUDIT', 'MANUAL_REPORT', 'RETROSPECTIVE_SCAN'] },
    metadata: mongoose.Schema.Types.Mixed,
    isResolved: { type: Boolean, default: false }
}, { timestamps: true });

const IncidentModel = mongoose.model('DetectionIncident', IncidentSchema);

class IncidentRepository {
    async logFailure(incidentData) {
        return await IncidentModel.create(incidentData);
    }

    async getUnresolvedIncidents(workspaceId) {
        return await IncidentModel.find({ workspaceId, isResolved: false });
    }

    async resolveIncident(incidentId, remediationData) {
        return await IncidentModel.findByIdAndUpdate(incidentId, {
            isResolved: true,
            metadata: { ...remediationData, resolvedAt: new Date() }
        });
    }
}

module.exports = new IncidentRepository();
