const Reimbursement = require('../models/Reimbursement');
const mongoose = require('mongoose');

class ReimbursementService {
  /**
   * Generate a unique claim number
   */
  generateClaimNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `RMB-${year}${month}-${random}`;
  }

  /**
   * Create a new reimbursement claim
   */
  async createClaim(userId, claimData) {
    const claim = new Reimbursement({
      ...claimData,
      user: userId,
      claimNumber: this.generateClaimNumber()
    });

    // Add initial status to approval history if not draft
    if (claimData.status !== 'draft') {
      claim.approvalHistory.push({
        status: claimData.status || 'pending',
        changedBy: userId,
        notes: 'Claim submitted'
      });
    }

    await claim.save();
    return claim;
  }

  /**
   * Update an existing claim
   */
  async updateClaim(claimId, userId, updateData) {
    const claim = await Reimbursement.findOne({ _id: claimId, user: userId });
    
    if (!claim) {
      throw new Error('Claim not found');
    }

    // Only allow updates for draft, pending, or rejected claims
    if (!['draft', 'pending', 'rejected'].includes(claim.status)) {
      throw new Error('Cannot update claim in current status');
    }

    Object.assign(claim, updateData);
    await claim.save();
    
    return claim;
  }

  /**
   * Submit a draft claim for approval
   */
  async submitClaim(claimId, userId) {
    const claim = await Reimbursement.findOne({ _id: claimId, user: userId });
    
    if (!claim) {
      throw new Error('Claim not found');
    }

    if (claim.status !== 'draft') {
      throw new Error('Only draft claims can be submitted');
    }

    claim.status = 'pending';
    claim.submissionDate = new Date();
    claim.approvalHistory.push({
      status: 'pending',
      changedBy: userId,
      notes: 'Claim submitted for approval'
    });

    await claim.save();
    return claim;
  }

  /**
   * Approve a claim
   */
  async approveClaim(claimId, approverId, notes = '') {
    const claim = await Reimbursement.findById(claimId);
    
    if (!claim) {
      throw new Error('Claim not found');
    }

    if (!['pending', 'under_review'].includes(claim.status)) {
      throw new Error('Claim cannot be approved in current status');
    }

    claim.status = 'approved';
    claim.approvedBy = approverId;
    claim.approvedAt = new Date();
    claim.approvalHistory.push({
      status: 'approved',
      changedBy: approverId,
      notes: notes || 'Claim approved'
    });

    await claim.save();
    return claim;
  }

  /**
   * Reject a claim
   */
  async rejectClaim(claimId, rejectorId, reason) {
    const claim = await Reimbursement.findById(claimId);
    
    if (!claim) {
      throw new Error('Claim not found');
    }

    if (!['pending', 'under_review', 'approved'].includes(claim.status)) {
      throw new Error('Claim cannot be rejected in current status');
    }

    claim.status = 'rejected';
    claim.rejectedBy = rejectorId;
    claim.rejectedAt = new Date();
    claim.rejectionReason = reason;
    claim.approvalHistory.push({
      status: 'rejected',
      changedBy: rejectorId,
      notes: reason
    });

    await claim.save();
    return claim;
  }

  /**
   * Mark claim as under review
   */
  async reviewClaim(claimId, reviewerId, notes = '') {
    const claim = await Reimbursement.findById(claimId);
    
    if (!claim) {
      throw new Error('Claim not found');
    }

    if (claim.status !== 'pending') {
      throw new Error('Only pending claims can be put under review');
    }

    claim.status = 'under_review';
    claim.approvalHistory.push({
      status: 'under_review',
      changedBy: reviewerId,
      notes: notes || 'Claim under review'
    });

    await claim.save();
    return claim;
  }

  /**
   * Process payment for approved claim
   */
  async processPayment(claimId, paymentData) {
    const claim = await Reimbursement.findById(claimId);
    
    if (!claim) {
      throw new Error('Claim not found');
    }

    if (claim.status !== 'approved') {
      throw new Error('Only approved claims can be paid');
    }

    claim.status = 'paid';
    claim.paidAt = new Date();
    claim.paymentDetails = paymentData;
    claim.approvalHistory.push({
      status: 'paid',
      changedBy: paymentData.paidBy,
      notes: `Payment processed: ${paymentData.paymentMethod}`
    });

    await claim.save();
    return claim;
  }

  /**
   * Cancel a claim
   */
  async cancelClaim(claimId, userId, reason = '') {
    const claim = await Reimbursement.findOne({ _id: claimId, user: userId });
    
    if (!claim) {
      throw new Error('Claim not found');
    }

    if (['paid', 'cancelled'].includes(claim.status)) {
      throw new Error('Cannot cancel claim in current status');
    }

    claim.status = 'cancelled';
    claim.approvalHistory.push({
      status: 'cancelled',
      changedBy: userId,
      notes: reason || 'Claim cancelled'
    });

    await claim.save();
    return claim;
  }

  /**
   * Get claims summary dashboard
   */
  async getSummary(userId) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    const [
      totalClaims,
      statusBreakdown,
      categoryBreakdown,
      monthlyTrend,
      pendingClaims,
      overdueClaims
    ] = await Promise.all([
      // Total claims count
      Reimbursement.countDocuments({ user: userObjectId, isActive: true }),
      
      // Status breakdown
      Reimbursement.aggregate([
        { $match: { user: userObjectId, isActive: true } },
        { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
      ]),
      
      // Category breakdown
      Reimbursement.aggregate([
        { $match: { user: userObjectId, isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
      ]),
      
      // Monthly trend (last 6 months)
      Reimbursement.aggregate([
        { 
          $match: { 
            user: userObjectId, 
            isActive: true,
            submissionDate: { 
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) 
            }
          }
        },
        {
          $group: {
            _id: { 
              year: { $year: '$submissionDate' },
              month: { $month: '$submissionDate' }
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } }
      ]),
      
      // Pending claims
      Reimbursement.find({ 
        user: userObjectId, 
        status: { $in: ['pending', 'under_review'] },
        isActive: true
      }).sort({ submissionDate: -1 }).limit(5),
      
      // Overdue claims
      Reimbursement.find({
        user: userObjectId,
        status: { $nin: ['paid', 'cancelled'] },
        dueDate: { $lt: new Date() },
        isActive: true
      }).sort({ dueDate: 1 })
    ]);

    // Calculate totals
    const totalAmount = statusBreakdown.reduce((sum, item) => sum + item.totalAmount, 0);
    const pendingAmount = statusBreakdown
      .filter(item => ['pending', 'under_review', 'approved'].includes(item._id))
      .reduce((sum, item) => sum + item.totalAmount, 0);
    const paidAmount = statusBreakdown
      .filter(item => item._id === 'paid')
      .reduce((sum, item) => sum + item.totalAmount, 0);

    return {
      overview: {
        totalClaims,
        totalAmount: Math.round(totalAmount * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        paidAmount: Math.round(paidAmount * 100) / 100,
        pendingCount: statusBreakdown
          .filter(item => ['pending', 'under_review'].includes(item._id))
          .reduce((sum, item) => sum + item.count, 0),
        approvedCount: statusBreakdown
          .filter(item => item._id === 'approved')
          .reduce((sum, item) => sum + item.count, 0),
        paidCount: statusBreakdown
          .filter(item => item._id === 'paid')
          .reduce((sum, item) => sum + item.count, 0)
      },
      statusBreakdown: statusBreakdown.map(item => ({
        status: item._id,
        count: item.count,
        amount: Math.round(item.totalAmount * 100) / 100
      })),
      categoryBreakdown: categoryBreakdown.map(item => ({
        category: item._id,
        count: item.count,
        amount: Math.round(item.totalAmount * 100) / 100
      })),
      monthlyTrend: monthlyTrend.map(item => ({
        month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
        count: item.count,
        amount: Math.round(item.totalAmount * 100) / 100
      })),
      pendingClaims,
      overdueClaims,
      requiresAttention: overdueClaims.length > 0 || pendingClaims.some(c => c.daysSinceSubmission > 7)
    };
  }

  /**
   * Get claims needing attention
   */
  async getClaimsNeedingAttention(userId) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const claims = await Reimbursement.find({
      user: userObjectId,
      isActive: true,
      $or: [
        // Overdue claims
        { 
          status: { $nin: ['paid', 'cancelled'] },
          dueDate: { $lt: now }
        },
        // Pending for more than 7 days
        {
          status: 'pending',
          submissionDate: { $lt: sevenDaysAgo }
        },
        // High priority pending claims
        {
          status: { $in: ['pending', 'under_review'] },
          priority: 'urgent'
        }
      ]
    }).sort({ priority: -1, submissionDate: 1 });

    return claims.map(claim => ({
      claimId: claim._id,
      claimNumber: claim.claimNumber,
      title: claim.title,
      status: claim.status,
      amount: claim.amount,
      priority: claim.priority,
      daysSinceSubmission: claim.daysSinceSubmission,
      isOverdue: claim.isOverdue,
      daysUntilDue: claim.daysUntilDue,
      attentionType: claim.isOverdue ? 'overdue' : 
                    claim.daysSinceSubmission > 7 ? 'delayed' : 
                    claim.priority === 'urgent' ? 'urgent' : 'pending'
    }));
  }

  /**
   * Get approval queue (for managers/approvers)
   */
  async getApprovalQueue(status = 'pending', limit = 20) {
    const query = { 
      status,
      isActive: true
    };

    const claims = await Reimbursement.find(query)
      .populate('user', 'name email')
      .sort({ priority: -1, submissionDate: 1 })
      .limit(parseInt(limit));

    return claims;
  }

  /**
   * Bulk approve claims
   */
  async bulkApprove(claimIds, approverId, notes = '') {
    const results = [];
    
    for (const claimId of claimIds) {
      try {
        const claim = await this.approveClaim(claimId, approverId, notes);
        results.push({ claimId, success: true, claim });
      } catch (error) {
        results.push({ claimId, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Bulk process payments
   */
  async bulkProcessPayments(claimIds, paymentData) {
    const results = [];
    
    for (const claimId of claimIds) {
      try {
        const claim = await this.processPayment(claimId, paymentData);
        results.push({ claimId, success: true, claim });
      } catch (error) {
        results.push({ claimId, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Generate reimbursement report
   */
  async generateReport(userId, filters = {}) {
    const query = { 
      user: new mongoose.Types.ObjectId(userId),
      isActive: true
    };

    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.startDate || filters.endDate) {
      query.submissionDate = {};
      if (filters.startDate) query.submissionDate.$gte = new Date(filters.startDate);
      if (filters.endDate) query.submissionDate.$lte = new Date(filters.endDate);
    }

    const claims = await Reimbursement.find(query)
      .sort({ submissionDate: -1 })
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name');

    const summary = {
      totalClaims: claims.length,
      totalAmount: claims.reduce((sum, c) => sum + c.amount, 0),
      byStatus: {},
      byCategory: {}
    };

    claims.forEach(claim => {
      // By status
      summary.byStatus[claim.status] = (summary.byStatus[claim.status] || 0) + 1;
      
      // By category
      summary.byCategory[claim.category] = (summary.byCategory[claim.category] || 0) + claim.amount;
    });

    return {
      summary,
      claims: claims.map(c => ({
        claimNumber: c.claimNumber,
        title: c.title,
        category: c.category,
        amount: c.amount,
        status: c.status,
        submissionDate: c.submissionDate,
        expenseDate: c.expenseDate,
        payee: c.payee,
        approvedBy: c.approvedBy?.name,
        paidAt: c.paidAt
      }))
    };
  }

  /**
   * Get claim statistics for a date range
   */
  async getStatistics(userId, startDate, endDate) {
    const query = {
      user: new mongoose.Types.ObjectId(userId),
      isActive: true,
      submissionDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    const stats = await Reimbursement.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalClaims: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' },
          maxAmount: { $max: '$amount' },
          minAmount: { $min: '$amount' }
        }
      }
    ]);

    const statusDistribution = await Reimbursement.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    return {
      period: { startDate, endDate },
      summary: stats[0] || {
        totalClaims: 0,
        totalAmount: 0,
        avgAmount: 0,
        maxAmount: 0,
        minAmount: 0
      },
      statusDistribution: statusDistribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
  }
}

module.exports = new ReimbursementService();
