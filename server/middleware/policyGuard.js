const Policy = require('../models/Policy');

class PolicyGuard {
  /**
   * Middleware to check policy violations and set approval requirements
   */
  static async enforcePolicy() {
    return async (req, res, next) => {
      try {
        if (!req.method.match(/^(POST|PUT|PATCH)$/)) {
          return next();
        }

        // Extract workspace and transaction details
        const workspaceId = req.body.workspaceId || req.params.workspaceId;
        const { amount, category, resourceType } = req.body;

        if (!workspaceId || !resourceType) {
          return next();
        }

        // Get all active policies for workspace
        const policies = await Policy.find({
          workspaceId,
          isActive: true,
          deletedAt: null
        }).sort({ priority: -1 });

        // Check for policy violations
        const violations = [];
        const matchedPolicies = [];

        const transaction = {
          amount,
          category,
          resourceType,
          requesterRole: req.user.role,
          department: req.body.department || 'default'
        };

        for (const policy of policies) {
          if (policy.matchesTransaction(transaction)) {
            matchedPolicies.push(policy);
            violations.push({
              policyId: policy._id,
              policyName: policy.name,
              riskScore: policy.riskScore,
              requiresApproval: true,
              approvalChain: policy.getApprovalChain(),
              holdFunds: policy.actions.holdFunds
            });
          }
        }

        // Store policy check results in request
        req.policyCheck = {
          policies: matchedPolicies,
          violations,
          requiresApproval: violations.length > 0,
          escalate: violations.some(v => v.riskScore > 75)
        };

        next();
      } catch (error) {
        console.error('Policy guard error:', error);
        next();
      }
    };
  }

  /**
   * Middleware to check approval permissions
   */
  static async requireApproval() {
    return async (req, res, next) => {
      try {
        if (!req.policyCheck || !req.policyCheck.requiresApproval) {
          return next();
        }

        const { violations } = req.policyCheck;
        const maxRiskScore = Math.max(...violations.map(v => v.riskScore));

        // Determine required approval role based on risk
        let requiredRole = 'manager';
        if (maxRiskScore > 80) requiredRole = 'admin';
        if (maxRiskScore > 90) requiredRole = 'workspace-owner';

        // Check user role
        const userRoles = req.user.roles || [req.user.role];
        if (!userRoles.includes(requiredRole)) {
          return res.status(403).json({
            success: false,
            message: 'Requires approval from ' + requiredRole,
            violations,
            requiresApproval: true
          });
        }

        // Mark as approved by self (admin override)
        req.policyCheck.selfApproved = true;
        req.policyCheck.approvedBy = req.user._id;
        req.policyCheck.approvedAt = Date.now();

        next();
      } catch (error) {
        console.error('Approval check error:', error);
        next();
      }
    };
  }

  /**
   * Middleware to prevent fraud patterns
   */
  static async detectFraud() {
    return async (req, res, next) => {
      try {
        const workspaceId = req.body.workspaceId;
        const userId = req.user._id;

        if (!workspaceId) return next();

        // Check for fraud patterns in recent transactions
        const Expense = require('../models/Expense');
        
        // Pattern 1: Rapid succession of large transactions
        const recentTransactions = await Expense.find({
          workspaceId,
          createdBy: userId,
          createdAt: { $gte: new Date(Date.now() - 3600000) } // Last hour
        });

        const totalAmount = recentTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        
        req.fraudCheck = {
          recentCount: recentTransactions.length,
          recentTotal: totalAmount,
          patterns: []
        };

        // Pattern 2: Multiple high-value transactions
        if (recentTransactions.length >= 5 && totalAmount > 10000) {
          req.fraudCheck.patterns.push({
            type: 'rapid_succession',
            severity: 'high',
            message: '5+ transactions totaling $10,000+ in 1 hour'
          });
        }

        // Pattern 3: Category inconsistency
        if (req.body.category && recentTransactions.length > 0) {
          const categories = recentTransactions.map(t => t.category);
          const uniqueCategories = new Set(categories).size;
          
          if (uniqueCategories >= 4) {
            req.fraudCheck.patterns.push({
              type: 'category_jumping',
              severity: 'medium',
              message: 'Transactions spanning 4+ categories in short time'
            });
          }
        }

        // Pattern 4: Round numbers (potential falsification)
        const isRoundNumber = (num) => num % 100 === 0 || num % 50 === 0;
        const roundTransactions = recentTransactions.filter(t => isRoundNumber(t.amount));
        
        if (roundTransactions.length >= 3) {
          req.fraudCheck.patterns.push({
            type: 'round_numbers',
            severity: 'low',
            message: '3+ transactions with round numbers'
          });
        }

        // Escalate if fraud patterns detected
        if (req.fraudCheck.patterns.some(p => p.severity === 'high')) {
          req.policyCheck = req.policyCheck || {};
          req.policyCheck.escalate = true;
          req.policyCheck.requiresApproval = true;
        }

        next();
      } catch (error) {
        console.error('Fraud detection error:', error);
        next();
      }
    };
  }

  /**
   * Middleware to apply policy state to request
   */
  static async applyPolicyState() {
    return async (req, res, next) => {
      try {
        if (!req.policyCheck || !req.policyCheck.requiresApproval) {
          return next();
        }

        // Set expense state to pending_approval
        req.body.approvalStatus = req.policyCheck.selfApproved ? 'approved' : 'pending_approval';
        req.body.policyFlags = req.policyCheck.violations.map(v => ({
          policyId: v.policyId,
          policyName: v.policyName,
          riskScore: v.riskScore
        }));
        req.body.requiresApproval = true;
        
        if (req.policyCheck.holdFunds) {
          req.body.fundHeld = true;
        }

        if (req.policyCheck.escalate) {
          req.body.escalatedApproval = true;
        }

        next();
      } catch (error) {
        console.error('Apply policy state error:', error);
        next();
      }
    };
  }
}

module.exports = PolicyGuard;
