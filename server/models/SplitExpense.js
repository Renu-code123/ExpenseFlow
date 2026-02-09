const mongoose = require('mongoose');

const splitExpenseSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0.01
    },
    currency: {
        type: String,
        default: 'INR',
        uppercase: true
    },
    paidBy: {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: String,
        email: String
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        default: null
    },
    category: {
        type: String,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'shopping', 'accommodation', 'other'],
        default: 'other'
    },
    date: {
        type: Date,
        default: Date.now
    },
    splitType: {
        type: String,
        enum: ['equal', 'exact', 'percentage', 'shares'],
        required: true,
        default: 'equal'
    },
    splits: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: String,
        email: String,
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        percentage: Number,
        shares: Number,
        paid: {
            type: Boolean,
            default: false
        },
        paidAt: Date
    }],
    notes: {
        type: String,
        trim: true,
        maxlength: 500
    },
    receipt: {
        url: String,
        publicId: String
    },
    isSettled: {
        type: Boolean,
        default: false
    },
    settledAt: Date,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
splitExpenseSchema.index({ group: 1, createdAt: -1 });
splitExpenseSchema.index({ 'paidBy.user': 1 });
splitExpenseSchema.index({ 'splits.user': 1 });
splitExpenseSchema.index({ isSettled: 1 });
splitExpenseSchema.index({ date: -1 });

// Validate splits total matches totalAmount
splitExpenseSchema.pre('save', function(next) {
    const totalSplits = this.splits.reduce((sum, split) => sum + split.amount, 0);
    const difference = Math.abs(this.totalAmount - totalSplits);
    
    // Allow small rounding differences (0.01)
    if (difference > 0.01) {
        return next(new Error(`Split amounts (${totalSplits}) must equal total amount (${this.totalAmount})`));
    }
    
    next();
});

// Method to check if all splits are paid
splitExpenseSchema.methods.checkSettled = function() {
    const allPaid = this.splits.every(split => split.paid);
    if (allPaid && !this.isSettled) {
        this.isSettled = true;
        this.settledAt = new Date();
    }
    return allPaid;
};

// Method to mark split as paid
splitExpenseSchema.methods.markSplitPaid = async function(userId) {
    const split = this.splits.find(s => s.user.toString() === userId.toString());
    if (split) {
        split.paid = true;
        split.paidAt = new Date();
        this.checkSettled();
        return await this.save();
    }
    return null;
};

// Method to calculate balance for a user
splitExpenseSchema.methods.getUserBalance = function(userId) {
    let balance = 0;
    
    // If user paid, they are owed
    if (this.paidBy.user.toString() === userId.toString()) {
        balance += this.totalAmount;
    }
    
    // Subtract what user owes
    const userSplit = this.splits.find(s => s.user.toString() === userId.toString());
    if (userSplit) {
        balance -= userSplit.amount;
    }
    
    return balance;
};

// Static method to calculate user's total balance
splitExpenseSchema.statics.calculateUserBalance = async function(userId) {
    const expenses = await this.find({
        $or: [
            { 'paidBy.user': userId },
            { 'splits.user': userId }
        ],
        isSettled: false
    });
    
    const balances = {};
    
    expenses.forEach(expense => {
        const paidById = expense.paidBy.user.toString();
        
        expense.splits.forEach(split => {
            const splitUserId = split.user.toString();
            
            // Skip if same user
            if (paidById === splitUserId) return;
            
            // If current user paid
            if (paidById === userId.toString()) {
                if (!balances[splitUserId]) {
                    balances[splitUserId] = {
                        userId: splitUserId,
                        name: split.name,
                        email: split.email,
                        amount: 0
                    };
                }
                balances[splitUserId].amount += split.amount;
            }
            
            // If current user owes
            if (splitUserId === userId.toString()) {
                if (!balances[paidById]) {
                    balances[paidById] = {
                        userId: paidById,
                        name: expense.paidBy.name,
                        email: expense.paidBy.email,
                        amount: 0
                    };
                }
                balances[paidById].amount -= split.amount;
            }
        });
    });
    
    return Object.values(balances).filter(b => Math.abs(b.amount) > 0.01);
};

// Static method to get group balances
splitExpenseSchema.statics.getGroupBalances = async function(groupId) {
    const expenses = await this.find({
        group: groupId,
        isSettled: false
    }).populate('paidBy.user splits.user', 'name email');
    
    const balances = {};
    
    expenses.forEach(expense => {
        expense.splits.forEach(split => {
            const paidById = expense.paidBy.user._id.toString();
            const splitUserId = split.user._id.toString();
            
            if (paidById === splitUserId) return;
            
            const key = [paidById, splitUserId].sort().join('-');
            
            if (!balances[key]) {
                balances[key] = {
                    from: splitUserId,
                    to: paidById,
                    amount: 0
                };
            }
            
            if (balances[key].from === splitUserId) {
                balances[key].amount += split.amount;
            } else {
                balances[key].amount -= split.amount;
            }
        });
    });
    
    return Object.values(balances)
        .filter(b => Math.abs(b.amount) > 0.01)
        .map(b => b.amount < 0 ? { from: b.to, to: b.from, amount: -b.amount } : b);
};

module.exports = mongoose.model('SplitExpense', splitExpenseSchema);
