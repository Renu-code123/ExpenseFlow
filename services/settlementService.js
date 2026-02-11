const IntercompanyTransaction = require('../models/IntercompanyTransaction');
const ReconciliationReport = require('../models/ReconciliationReport');

class SettlementService {
  async generateSettlementAdvice(userId, entityA, entityB) {
    const outbound = await IntercompanyTransaction.find({
      userId,
      sourceEntityId: entityA,
      targetEntityId: entityB,
      status: { $in: ['Pending', 'Matched'] }
    });

    const inbound = await IntercompanyTransaction.find({
      userId,
      sourceEntityId: entityB,
      targetEntityId: entityA,
      status: { $in: ['Pending', 'Matched'] }
    });

    const totalOut = outbound.reduce((sum, t) => sum + t.amount, 0);
    const totalIn = inbound.reduce((sum, t) => sum + t.amount, 0);

    return {
      settlementPair: [entityA, entityB],
      summary: {
        totalOutbound: totalOut,
        totalInbound: totalIn,
        netPayable: totalOut - totalIn
      },
      eligibleTransactions: [...outbound, ...inbound].map(t => t._id)
    };
  }

  async processSettlement(userId, txnIds) {
    const result = await IntercompanyTransaction.updateMany(
      { _id: { $in: txnIds }, userId },
      {
        $set: { status: 'Settled' },
        $push: { auditTrail: { action: 'Settled via automated processing', performedBy: 'System' } }
      }
    );

    return result;
  }

  async getIntercompanyHistory(userId) {
    return await IntercompanyTransaction.find({ userId })
      .populate('sourceEntityId', 'name')
      .populate('targetEntityId', 'name')
      .sort({ transactionDate: -1 });
  }
}

module.exports = new SettlementService();
