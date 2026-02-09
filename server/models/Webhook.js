const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String, required: true },
  events: [{ type: String, enum: ['expense.created', 'expense.updated', 'budget.exceeded', 'sync.completed'] }],
  secret: String,
  active: { type: Boolean, default: true },
  lastTriggered: Date,
  failureCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Webhook', webhookSchema);