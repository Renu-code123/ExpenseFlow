const Settlement = require('../models/Settlement');
const ExpenseSplit = require('../models/ExpenseSplit');
const Group = require('../models/Group');
const User = require('../models/User');
const notificationService = require('./notificationService');

/**
 * Settlement Service
 * Implements Debt Simplification & Settlement Optimization using Graph Theory
 * 
 * Algorithm: Greedy Debt Minimization
 * 1. Build a debt graph: edges represent IOUs between users
 * 2. Calculate net balance for each user (creditor vs debtor)
 * 3. Match maximum creditors with maximum debtors
 * 4. Reduce total number of transactions needed
 */
class SettlementService {
  constructor() {
    this.io = null; // Socket.io instance
  }

  /**
   * Set Socket.io instance for real-time updates
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Build debt graph from expense splits in a workspace/group
   * @param {string} groupId - Group/Workspace ID
   * @returns {Object} Debt graph with balances
   */
  async buildDebtGraph(groupId) {
    // Get all pending/partial splits in this group
    const splits = await ExpenseSplit.find({
      group: groupId,
      status: { $in: ['pending', 'partial'] }
    }).populate('participants.user createdBy', '_id name email');

    // Debt graph: Map<fromUserId, Map<toUserId, amount>>
    const debtGraph = new Map();
    // Net balance for each user: positive = owed money, negative = owes money
    const netBalances = new Map();
    // User info cache
    const userInfo = new Map();

    for (const split of splits) {
      const creditorId = split.createdBy._id.toString();
      
      // Cache user info
      if (!userInfo.has(creditorId)) {
        userInfo.set(creditorId, {
          id: creditorId,
          name: split.createdBy.name,
          email: split.createdBy.email
        });
      }

      for (const participant of split.participants) {
        if (participant.isPaid) continue; // Skip paid participants
        
        const debtorId = participant.user._id?.toString() || participant.user.toString();
        
        // Skip if debtor is the creditor (creator doesn't owe themselves)
        if (debtorId === creditorId) continue;

        // Cache user info
        if (!userInfo.has(debtorId) && participant.user.name) {
          userInfo.set(debtorId, {
            id: debtorId,
            name: participant.user.name,
            email: participant.user.email
          });
        }

        const amount = participant.amount;

        // Add to debt graph
        if (!debtGraph.has(debtorId)) {
          debtGraph.set(debtorId, new Map());
        }
        const currentDebt = debtGraph.get(debtorId).get(creditorId) || 0;
        debtGraph.get(debtorId).set(creditorId, currentDebt + amount);

        // Update net balances
        // Debtor's balance decreases (they owe money)
        netBalances.set(debtorId, (netBalances.get(debtorId) || 0) - amount);
        // Creditor's balance increases (they are owed money)
        netBalances.set(creditorId, (netBalances.get(creditorId) || 0) + amount);
      }
    }

    return { debtGraph, netBalances, userInfo };
  }

  /**
   * Get original (non-simplified) debts for a group
   * @param {string} groupId - Group/Workspace ID
   * @returns {Array} List of original debts
   */
  async getOriginalDebts(groupId) {
    const { debtGraph, userInfo } = await this.buildDebtGraph(groupId);
    const debts = [];

    for (const [debtorId, creditors] of debtGraph) {
      for (const [creditorId, amount] of creditors) {
        if (amount > 0.01) { // Only include meaningful amounts
          debts.push({
            from: userInfo.get(debtorId) || { id: debtorId },
            to: userInfo.get(creditorId) || { id: creditorId },
            amount: Math.round(amount * 100) / 100
          });
        }
      }
    }

    return debts;
  }

  /**
   * Simplify debts using Greedy Algorithm
   * Minimizes the number of transactions needed to settle all debts
   * 
   * @param {string} groupId - Group/Workspace ID
   * @returns {Object} Simplified settlements and statistics
   */
  async simplifyDebts(groupId) {
    const { netBalances, userInfo } = await this.buildDebtGraph(groupId);
    
    // Separate into creditors (positive balance) and debtors (negative balance)
    const creditors = []; // Users who are owed money
    const debtors = [];   // Users who owe money

    for (const [userId, balance] of netBalances) {
      if (Math.abs(balance) < 0.01) continue; // Skip zero balances
      
      const user = userInfo.get(userId) || { id: userId, name: 'Unknown' };
      
      if (balance > 0) {
        creditors.push({ ...user, balance });
      } else {
        debtors.push({ ...user, balance: Math.abs(balance) });
      }
    }

    // Sort by balance for greedy matching (highest first)
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => b.balance - a.balance);

    // Greedy matching algorithm
    const simplifiedSettlements = [];
    let creditorIdx = 0;
    let debtorIdx = 0;

    while (creditorIdx < creditors.length && debtorIdx < debtors.length) {
      const creditor = creditors[creditorIdx];
      const debtor = debtors[debtorIdx];
      
      // Settlement amount is minimum of what debtor owes and creditor is owed
      const settlementAmount = Math.min(creditor.balance, debtor.balance);
      
      if (settlementAmount >= 0.01) {
        simplifiedSettlements.push({
          from: {
            id: debtor.id,
            name: debtor.name,
            email: debtor.email
          },
          to: {
            id: creditor.id,
            name: creditor.name,
            email: creditor.email
          },
          amount: Math.round(settlementAmount * 100) / 100
        });
      }

      // Update balances
      creditor.balance -= settlementAmount;
      debtor.balance -= settlementAmount;

      // Move to next if balance is settled
      if (creditor.balance < 0.01) creditorIdx++;
      if (debtor.balance < 0.01) debtorIdx++;
    }

    // Calculate statistics
    const originalDebts = await this.getOriginalDebts(groupId);
    const transactionReduction = originalDebts.length - simplifiedSettlements.length;
    const percentageReduction = originalDebts.length > 0 
      ? Math.round((transactionReduction / originalDebts.length) * 100) 
      : 0;

    return {
      original: {
        debts: originalDebts,
        count: originalDebts.length,
        totalAmount: originalDebts.reduce((sum, d) => sum + d.amount, 0)
      },
      simplified: {
        settlements: simplifiedSettlements,
        count: simplifiedSettlements.length,
        totalAmount: simplifiedSettlements.reduce((sum, s) => sum + s.amount, 0)
      },
      savings: {
        transactionsReduced: transactionReduction,
        percentageReduction
      }
    };
  }

  /**
   * Get balances for all members in a group
   * @param {string} groupId - Group/Workspace ID
   * @returns {Array} Member balances
   */
  async getMemberBalances(groupId) {
    const { netBalances, userInfo } = await this.buildDebtGraph(groupId);
    const balances = [];

    for (const [userId, balance] of netBalances) {
      const user = userInfo.get(userId) || { id: userId, name: 'Unknown' };
      balances.push({
        user,
        balance: Math.round(balance * 100) / 100,
        status: balance > 0.01 ? 'owed' : balance < -0.01 ? 'owes' : 'settled'
      });
    }

    // Sort by absolute balance
    balances.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    return balances;
  }

  /**
   * Create optimized settlements from simplified debts
   * @param {string} groupId - Group/Workspace ID
   * @param {string} createdBy - User ID creating the settlements
   * @returns {Array} Created settlement records
   */
  async createOptimizedSettlements(groupId, createdBy) {
    const { simplified, original } = await this.simplifyDebts(groupId);
    const settlements = [];

    // First, check if all original debts exist and are valid
    const group = await Group.findById(groupId);
    if (!group) throw new Error('Group not found');

    for (const settlement of simplified.settlements) {
      // Create settlement record
      const newSettlement = new Settlement({
        paidBy: {
          user: settlement.from.id,
          name: settlement.from.name,
          email: settlement.from.email
        },
        paidTo: {
          user: settlement.to.id,
          name: settlement.to.name,
          email: settlement.to.email
        },
        amount: settlement.amount,
        currency: group.currency || 'USD',
        group: groupId,
        status: 'pending',
        notes: `Optimized settlement (reduced from ${original.count} to ${simplified.count} transactions)`
      });

      await newSettlement.save();
      settlements.push(newSettlement);

      // Broadcast settlement request via Socket.io
      this.broadcastSettlementRequest(settlement, groupId);
    }

    return {
      settlements,
      summary: simplified
    };
  }

  /**
   * Request a settlement (debtor initiates payment)
   * @param {string} settlementId - Settlement ID
   * @param {string} userId - User requesting
   * @param {Object} paymentDetails - Payment method and reference
   */
  async requestSettlement(settlementId, userId, paymentDetails) {
    const settlement = await Settlement.findById(settlementId);
    if (!settlement) throw new Error('Settlement not found');

    // Verify user is the debtor
    if (settlement.paidBy.user.toString() !== userId.toString()) {
      throw new Error('Only the debtor can request settlement');
    }

    if (settlement.status !== 'pending') {
      throw new Error('Settlement is not in pending state');
    }

    // Update settlement
    settlement.status = 'pending'; // Keep pending until confirmed
    settlement.method = paymentDetails.method || 'cash';
    settlement.transactionId = paymentDetails.reference;
    settlement.notes = (settlement.notes || '') + 
      `\n[REQUESTED]: ${new Date().toISOString()} via ${paymentDetails.method}`;

    await settlement.save();

    // Notify creditor
    await this.notifySettlementRequest(settlement);
    
    // Broadcast via Socket.io
    this.broadcastSettlementUpdate(settlement, 'requested');

    return settlement;
  }

  /**
   * Confirm a settlement (creditor confirms receipt)
   * @param {string} settlementId - Settlement ID
   * @param {string} userId - User confirming
   */
  async confirmSettlement(settlementId, userId) {
    const settlement = await Settlement.findById(settlementId)
      .populate('group', 'name');
    
    if (!settlement) throw new Error('Settlement not found');

    // Verify user is the creditor
    if (settlement.paidTo.user.toString() !== userId.toString()) {
      throw new Error('Only the creditor can confirm settlement');
    }

    // Update settlement
    settlement.status = 'verified';
    settlement.verifiedBy = userId;
    settlement.verifiedAt = new Date();

    await settlement.save();

    // Mark related expense splits as paid (if applicable)
    await this.markRelatedSplitsAsPaid(settlement);

    // Notify debtor
    await this.notifySettlementConfirmed(settlement);
    
    // Broadcast via Socket.io
    this.broadcastSettlementUpdate(settlement, 'confirmed');

    return settlement;
  }

  /**
   * Reject a settlement (creditor rejects)
   * @param {string} settlementId - Settlement ID
   * @param {string} userId - User rejecting
   * @param {string} reason - Rejection reason
   */
  async rejectSettlement(settlementId, userId, reason) {
    const settlement = await Settlement.findById(settlementId);
    if (!settlement) throw new Error('Settlement not found');

    // Verify user is the creditor
    if (settlement.paidTo.user.toString() !== userId.toString()) {
      throw new Error('Only the creditor can reject settlement');
    }

    // Update settlement
    settlement.status = 'disputed';
    settlement.notes = (settlement.notes || '') + `\n[REJECTED]: ${reason}`;

    await settlement.save();

    // Notify debtor
    await this.notifySettlementRejected(settlement, reason);
    
    // Broadcast via Socket.io
    this.broadcastSettlementUpdate(settlement, 'rejected');

    return settlement;
  }

  /**
   * Get settlement center data for a workspace
   * @param {string} groupId - Group/Workspace ID
   * @param {string} userId - Current user ID
   */
  async getSettlementCenter(groupId, userId) {
    const [simplification, balances, pendingSettlements, recentSettlements] = await Promise.all([
      this.simplifyDebts(groupId),
      this.getMemberBalances(groupId),
      Settlement.find({ 
        group: groupId, 
        status: { $in: ['pending', 'disputed'] }
      }).populate('paidBy.user paidTo.user', 'name email').sort({ createdAt: -1 }),
      Settlement.find({ 
        group: groupId, 
        status: 'verified'
      }).populate('paidBy.user paidTo.user', 'name email').sort({ verifiedAt: -1 }).limit(10)
    ]);

    // Get user's position
    const userBalance = balances.find(b => b.user.id === userId.toString());

    return {
      simplification,
      balances,
      userBalance: userBalance || { balance: 0, status: 'settled' },
      pendingSettlements,
      recentSettlements,
      summary: {
        totalPending: pendingSettlements.reduce((sum, s) => sum + s.amount, 0),
        pendingCount: pendingSettlements.length,
        verifiedCount: recentSettlements.length
      }
    };
  }

  /**
   * Mark related expense splits as paid after settlement
   */
  async markRelatedSplitsAsPaid(settlement) {
    // Find splits where debtor owes creditor in this group
    const splits = await ExpenseSplit.find({
      group: settlement.group,
      createdBy: settlement.paidTo.user,
      'participants.user': settlement.paidBy.user,
      'participants.isPaid': false
    });

    let remainingAmount = settlement.amount;

    for (const split of splits) {
      if (remainingAmount <= 0) break;

      const participant = split.participants.find(
        p => p.user.toString() === settlement.paidBy.user.toString() && !p.isPaid
      );

      if (participant && participant.amount <= remainingAmount) {
        participant.isPaid = true;
        participant.paidAt = new Date();
        remainingAmount -= participant.amount;

        // Update split status
        const allPaid = split.participants.every(p => p.isPaid);
        split.status = allPaid ? 'completed' : 'partial';
        
        await split.save();
      }
    }
  }

  /**
   * Broadcast settlement request via Socket.io
   */
  broadcastSettlementRequest(settlement, groupId) {
    if (!this.io) return;

    // Notify creditor
    this.io.to(`user_${settlement.to.id}`).emit('settlement_request', {
      type: 'new_settlement',
      settlement: {
        from: settlement.from,
        to: settlement.to,
        amount: settlement.amount,
        groupId
      }
    });

    // Broadcast to group room
    this.io.to(`group_${groupId}`).emit('settlement_update', {
      type: 'new_optimized_settlement',
      groupId,
      count: 1
    });
  }

  /**
   * Broadcast settlement status update
   */
  broadcastSettlementUpdate(settlement, action) {
    if (!this.io) return;

    const payload = {
      type: `settlement_${action}`,
      settlementId: settlement._id,
      from: settlement.paidBy,
      to: settlement.paidTo,
      amount: settlement.amount,
      status: settlement.status
    };

    // Notify both parties
    this.io.to(`user_${settlement.paidBy.user}`).emit('settlement_update', payload);
    this.io.to(`user_${settlement.paidTo.user}`).emit('settlement_update', payload);

    // Broadcast to group
    if (settlement.group) {
      this.io.to(`group_${settlement.group}`).emit('settlement_update', payload);
    }
  }

  /**
   * Notification helpers
   */
  async notifySettlementRequest(settlement) {
    try {
      await notificationService.sendNotification(settlement.paidTo.user, {
        title: 'Settlement Request',
        message: `${settlement.paidBy.name} has marked a payment of ${settlement.currency} ${settlement.amount} as sent`,
        type: 'settlement_request',
        priority: 'high',
        data: { settlementId: settlement._id, amount: settlement.amount }
      });
    } catch (error) {
      console.error('Failed to send settlement request notification:', error);
    }
  }

  async notifySettlementConfirmed(settlement) {
    try {
      await notificationService.sendNotification(settlement.paidBy.user, {
        title: 'Payment Confirmed',
        message: `${settlement.paidTo.name} has confirmed receipt of ${settlement.currency} ${settlement.amount}`,
        type: 'settlement_confirmed',
        priority: 'medium',
        data: { settlementId: settlement._id, amount: settlement.amount }
      });
    } catch (error) {
      console.error('Failed to send settlement confirmed notification:', error);
    }
  }

  async notifySettlementRejected(settlement, reason) {
    try {
      await notificationService.sendNotification(settlement.paidBy.user, {
        title: 'Payment Rejected',
        message: `${settlement.paidTo.name} has rejected your payment: ${reason}`,
        type: 'settlement_rejected',
        priority: 'high',
        data: { settlementId: settlement._id, reason }
      });
    } catch (error) {
      console.error('Failed to send settlement rejected notification:', error);
    }
  }
}

module.exports = new SettlementService();
