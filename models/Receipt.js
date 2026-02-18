const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  expense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  cloudinaryId: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['image', 'pdf'],
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  ocrData: {
    extractedText: String,
    extractedAmount: Number,
    extractedDate: Date,
    confidence: Number
  },
  folder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentFolder',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Receipt', receiptSchema);