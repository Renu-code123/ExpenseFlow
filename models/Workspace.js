const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['admin', 'manager', 'member'], default: 'member' },
    permissions: [String],
    joinedAt: { type: Date, default: Date.now }
  }],
  inviteTokens: [{
    token: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'member'], default: 'member' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
    used: { type: Boolean, default: false }
  }],
  settings: {
    currency: { type: String, default: 'USD' },
    approvalRequired: { type: Boolean, default: false },
    approvalLimit: { type: Number, default: 1000 },
    expenseCategories: [String]
  }
}, { timestamps: true });

module.exports = mongoose.model('Workspace', workspaceSchema);