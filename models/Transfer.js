/**
 * Transfer Model
 * Issue #337: Multi-Account Liquidity Management
 * Handles transfers between accounts (e.g., ATM withdrawal: Bank -> Cash)
 */

const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Source Account
  fromAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  
  // Destination Account
  toAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  
  // Amount in source currency
  amount: {
    type: Number,
    required: true,
    min: [0.01, 'Transfer amount must be positive']
  },
  
  // Source currency
  fromCurrency: {
    type: String,
    required: true,
    uppercase: true
  },
  
  // Destination currency (for cross-currency transfers)
  toCurrency: {
    type: String,
    required: true,
    uppercase: true
  },
  
  // Amount received (may differ due to exchange rate)
  receivedAmount: {
    type: Number,
    required: true
  },
  
  // Exchange rate used (if cross-currency)
  exchangeRate: {
    type: Number,
    default: 1
  },
  
  // Fees
  fee: {
    type: Number,
    default: 0
  },
  
  feeAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    default: null // If null, fee is deducted from source
  },
  
  // Transfer Details
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  
  category: {
    type: String,
    enum: [
      'atm_withdrawal',    // Bank -> Cash
      'atm_deposit',       // Cash -> Bank
      'account_transfer',  // Between bank accounts
      'investment',        // To investment account
      'loan_payment',      // Paying off debt
      'credit_payment',    // Credit card payment
      'savings',           // To savings
      'currency_exchange', // Forex
      'crypto_purchase',   // Fiat -> Crypto
      'crypto_sale',       // Crypto -> Fiat
      'other'
    ],
    default: 'account_transfer'
  },
  
  // Date of transfer
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'completed'
  },
  
  // For recurring transfers
  isRecurring: {
    type: Boolean,
    default: false
  },
  
  recurringSchedule: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
    },
    dayOfWeek: Number, // 0-6 for weekly
    dayOfMonth: Number, // 1-31 for monthly
    nextDate: Date,
    endDate: Date
  },
  
  // Balance History References
  fromBalanceHistoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BalanceHistory'
  },
  
  toBalanceHistoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BalanceHistory'
  },
  
  // External reference
  externalReference: {
    type: String,
    default: null
  },
  
  // Metadata
  tags: [String],
  
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Indexes
transferSchema.index({ userId: 1, date: -1 });
transferSchema.index({ userId: 1, fromAccount: 1, date: -1 });
transferSchema.index({ userId: 1, toAccount: 1, date: -1 });
transferSchema.index({ userId: 1, category: 1, date: -1 });
transferSchema.index({ userId: 1, status: 1 });

// Validation: source and destination must be different
transferSchema.pre('validate', function(next) {
  if (this.fromAccount && this.toAccount && 
      this.fromAccount.toString() === this.toAccount.toString()) {
    next(new Error('Source and destination accounts must be different'));
  }
  next();
});

// Execute transfer and update account balances
transferSchema.statics.executeTransfer = async function(transferData) {
  const Account = mongoose.model('Account');
  const BalanceHistory = mongoose.model('BalanceHistory');
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { userId, fromAccountId, toAccountId, amount, description, category, date, fee = 0 } = transferData;
    
    // Get accounts
    const [fromAccount, toAccount] = await Promise.all([
      Account.findById(fromAccountId).session(session),
      Account.findById(toAccountId).session(session)
    ]);
    
    if (!fromAccount || !toAccount) {
      throw new Error('Invalid account(s)');
    }
    
    // Verify ownership
    if (fromAccount.userId.toString() !== userId.toString() || 
        toAccount.userId.toString() !== userId.toString()) {
      throw new Error('Unauthorized account access');
    }
    
    // Calculate exchange rate if cross-currency
    let exchangeRate = 1;
    let receivedAmount = amount;
    
    if (fromAccount.currency !== toAccount.currency) {
      const CurrencyRate = mongoose.model('CurrencyRate');
      const rates = await CurrencyRate.getLatestRates(fromAccount.currency);
      
      if (rates) {
        exchangeRate = rates.getRate(toAccount.currency) || 1;
        receivedAmount = amount * exchangeRate;
      }
    }
    
    // Total deduction from source (amount + fee)
    const totalDeduction = amount + fee;
    
    // Update source account
    const fromPreviousBalance = fromAccount.balance;
    fromAccount.balance -= totalDeduction;
    fromAccount.lastBalanceUpdate = new Date();
    await fromAccount.save({ session });
    
    // Update destination account
    const toPreviousBalance = toAccount.balance;
    toAccount.balance += receivedAmount;
    toAccount.lastBalanceUpdate = new Date();
    await toAccount.save({ session });
    
    // Create transfer record
    const transfer = new this({
      userId,
      fromAccount: fromAccountId,
      toAccount: toAccountId,
      amount,
      fromCurrency: fromAccount.currency,
      toCurrency: toAccount.currency,
      receivedAmount,
      exchangeRate,
      fee,
      description: description || `Transfer to ${toAccount.name}`,
      category: category || 'account_transfer',
      date: date || new Date(),
      status: 'completed'
    });
    
    // Create balance history records
    const [fromHistory, toHistory] = await Promise.all([
      BalanceHistory.create([{
        accountId: fromAccountId,
        userId,
        previousBalance: fromPreviousBalance,
        newBalance: fromAccount.balance,
        change: -totalDeduction,
        currency: fromAccount.currency,
        changeType: 'transfer_out',
        transferId: transfer._id,
        relatedAccountId: toAccountId,
        description: `Transfer to ${toAccount.name}`,
        source: 'transfer'
      }], { session }),
      BalanceHistory.create([{
        accountId: toAccountId,
        userId,
        previousBalance: toPreviousBalance,
        newBalance: toAccount.balance,
        change: receivedAmount,
        currency: toAccount.currency,
        changeType: 'transfer_in',
        transferId: transfer._id,
        relatedAccountId: fromAccountId,
        description: `Transfer from ${fromAccount.name}`,
        exchangeRate: exchangeRate !== 1 ? exchangeRate : null,
        source: 'transfer'
      }], { session })
    ]);
    
    transfer.fromBalanceHistoryId = fromHistory[0]._id;
    transfer.toBalanceHistoryId = toHistory[0]._id;
    await transfer.save({ session });
    
    await session.commitTransaction();
    
    return {
      transfer,
      fromAccount,
      toAccount
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Reverse a completed transfer
transferSchema.methods.reverse = async function(reason = 'Reversal requested') {
  if (this.status !== 'completed') {
    throw new Error('Only completed transfers can be reversed');
  }
  
  const Account = mongoose.model('Account');
  const BalanceHistory = mongoose.model('BalanceHistory');
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const [fromAccount, toAccount] = await Promise.all([
      Account.findById(this.fromAccount).session(session),
      Account.findById(this.toAccount).session(session)
    ]);
    
    // Reverse the balances
    const fromPrevBalance = fromAccount.balance;
    const toPrevBalance = toAccount.balance;
    
    fromAccount.balance += this.amount + this.fee;
    toAccount.balance -= this.receivedAmount;
    
    await fromAccount.save({ session });
    await toAccount.save({ session });
    
    // Create reversal history
    await BalanceHistory.create([
      {
        accountId: this.fromAccount,
        userId: this.userId,
        previousBalance: fromPrevBalance,
        newBalance: fromAccount.balance,
        change: this.amount + this.fee,
        currency: this.fromCurrency,
        changeType: 'transfer_in',
        transferId: this._id,
        relatedAccountId: this.toAccount,
        description: `Reversal: ${reason}`,
        source: 'transfer'
      },
      {
        accountId: this.toAccount,
        userId: this.userId,
        previousBalance: toPrevBalance,
        newBalance: toAccount.balance,
        change: -this.receivedAmount,
        currency: this.toCurrency,
        changeType: 'transfer_out',
        transferId: this._id,
        relatedAccountId: this.fromAccount,
        description: `Reversal: ${reason}`,
        source: 'transfer'
      }
    ], { session });
    
    this.status = 'reversed';
    this.notes = (this.notes || '') + `\nReversed: ${reason} at ${new Date().toISOString()}`;
    await this.save({ session });
    
    await session.commitTransaction();
    
    return this;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Get transfer summary
transferSchema.statics.getTransferSummary = async function(userId, options = {}) {
  const { startDate, endDate, groupBy = 'category' } = options;
  
  const match = { userId: new mongoose.Types.ObjectId(userId), status: 'completed' };
  
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: `$${groupBy}`,
        totalAmount: { $sum: '$amount' },
        totalFees: { $sum: '$fee' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);
};

module.exports = mongoose.model('Transfer', transferSchema);
