const IncidentPlaybook = require('../../models/IncidentPlaybook');
const PlaybookExecution = require('../../models/PlaybookExecution');
const PlaybookActionAudit = require('../../models/PlaybookActionAudit');
const PlaybookApprovalPolicy = require('../../models/PlaybookApprovalPolicy');
const SecurityIncident = require('../../models/SecurityIncident');
const User = require('../../models/User');
const crypto = require('crypto');
const PlaybookExecutorService = require('./playbookExecutorService');
const PlaybookApprovalGateService = require('./playbookApprovalGateService');
const notificationService = require('../notificationService');

/**
 * Incident Playbook Engine Service
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Core orchestration framework for automated security incident response
 * Manages deterministic execution, safe retries, approval checkpoints, and compensation
 */

class IncidentPlaybookEngineService {
  constructor() {
    this.executorService = new PlaybookExecutorService();
    this.approvalGateService = new PlaybookApprovalGateService();
    this.executionQueue = [];
    this.maxConcurrentExecutions = 10;
    this.activeExecutions = 0;
  }

  /**
   * Detect incident and trigger appropriate playbook
   */
  async detectAndOrchestrate(incidentContext) {
    try {
      const incident = await this.validateIncidentContext(incidentContext);
      
      // Find applicable playbook
      const playbooks = await this.findApplicablePlaybooks(incident);
      
      if (!playbooks.length) {
        console.warn(`No applicable playbooks for incident: ${incident.incidentId}`);
        return null;
      }
      
      // Select highest severity playbook
      const selectedPlaybook = playbooks.sort((a, b) => 
        this.severityToNumber(b.severity) - this.severityToNumber(a.severity)
      )[0];
      
      // Initiate execution
      return await this.executePlaybook(selectedPlaybook, incident, incidentContext);
      
    } catch (error) {
      console.error('Orchestration error:', error);
      throw new Error(`Orchestration failed: ${error.message}`);
    }
  }

  /**
   * Execute a playbook with full orchestration
   */
  async executePlaybook(playbook, incident, context) {
    const executionId = crypto.randomUUID();
    const traceId = crypto.randomUUID();
    
    try {
      // Validate playbook can execute
      if (!playbook.canExecute()) {
        throw new Error('Playbook cannot execute: missing configuration');
      }
      
      // Create execution record
      const execution = new PlaybookExecution({
        executionId,
        playbookId: playbook._id,
        playbookName: playbook.name,
        playbookType: playbook.playbookType,
        incidentId: incident._id,
        userId: incident.targetUser,
        status: 'INITIATED',
        startedAt: new Date(),
        riskLevel: incident.severity,
        confidenceScore: context.confidenceScore || 80,
        triggerEvent: context.triggerEvent || 'Automated Detection',
        triggerContext: context,
        traceId,
        tags: [playbook.playbookType, incident.incidentType]
      });
      
      await execution.save();
      
      // Add audit event
      execution.addAuditEvent('PLAYBOOK_INITIATED', {
        playbookId: playbook._id,
        incidentId: incident._id
      });
      
      // Evaluate policy gates
      const gateResults = await this.approvalGateService.evaluatePolicyGates(
        playbook,
        incident,
        execution
      );
      
      execution.policyGates = gateResults;
      
      if (gateResults.some(g => g.status === 'FAILED')) {
        execution.status = 'FAILED';
        execution.addAuditEvent('POLICY_GATE_FAILED', { gates: gateResults });
        await execution.save();
        
        // Escalate to analyst
        await this.escalateToAnalyst(execution, 'Policy gate failure');
        return execution;
      }
      
      execution.status = 'RUNNING';
      await execution.save();
      
      // Execute stages sequentially
      const actionsByStage = this.groupActionsByStage(playbook.actions);
      
      for (let stageNum = 1; stageNum <= Math.max(...Array.from(actionsByStage.keys())); stageNum++) {
        const stageActions = actionsByStage.get(stageNum) || [];
        
        if (stageActions.length === 0) continue;
        
        const stageExecution = {
          stageNumber: stageNum,
          status: 'PENDING',
          startedAt: new Date()
        };
        
        execution.stages.push(stageExecution);
        
        // Execute actions in parallel within stage
        const stageResults = await this.executeStage(
          stageActions,
          execution,
          playbook,
          incident,
          context
        );
        
        stageExecution.completedAt = new Date();
        stageExecution.status = stageResults.allSuccessful ? 'SUCCESS' : 'PARTIAL_FAILURE';
        
        // Check if we should continue to next stage
        if (!stageResults.shouldContinue) {
          execution.addAuditEvent('STAGE_EXECUTION_HALTED', {
            stage: stageNum,
            reason: stageResults.haltReason
          });
          break;
        }
      }
      
      // Calculate final status
      execution.status = this.calculateExecutionStatus(execution);
      execution.completedAt = new Date();
      execution.totalDuration = execution.completedAt - execution.startedAt;
      
      // Update metrics
      const success = execution.status === 'COMPLETED';
      playbook.incrementMetrics(success, execution.totalDuration);
      await playbook.save();
      
      // Generate incident summary
      if (execution.status === 'COMPLETED') {
        await this.notifyIncidentContainment(execution, incident);
      }
      
      await execution.save();
      
      return execution;
      
    } catch (error) {
      console.error(`Playbook execution error for ${executionId}:`, error);
      
      try {
        const execution = await PlaybookExecution.findOne({ executionId });
        if (execution) {
          execution.status = 'FAILED';
          execution.addAuditEvent('EXECUTION_ERROR', {
            error: error.message,
            stack: error.stack
          });
          await execution.save();
          
          // Attempt compensation
          await this.attemptCompensation(execution);
          
          // Escalate
          await this.escalateToAnalyst(execution, `Execution error: ${error.message}`);
        }
      } catch (e) {
        console.error('Error handling execution failure:', e);
      }
      
      throw error;
    }
  }

  /**
   * Execute a stage of actions
   */
  async executeStage(stageActions, execution, playbook, incident, context) {
    const results = {
      successCount: 0,
      failureCount: 0,
      skipCount: 0,
      allSuccessful: true,
      shouldContinue: true,
      haltReason: null
    };
    
    // Execute actions parallel with Promise.allSettled
    const actionPromises = stageActions.map(action =>
      this.executeAction(action, execution, playbook, incident, context)
        .catch(error => ({
          actionId: action.actionId,
          success: false,
          error: error.message
        }))
    );
    
    const outcomes = await Promise.allSettled(actionPromises);
    
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        if (outcome.value.success) {
          results.successCount++;
        } else if (outcome.value.skipped) {
          results.skipCount++;
        } else {
          results.failureCount++;
          results.allSuccessful = false;
        }
      } else {
        results.failureCount++;
        results.allSuccessful = false;
      }
    }
    
    // Determine if should continue (fail fast on critical actions)
    if (results.failureCount > 0) {
      const criticalFailure = stageActions.some(a => 
        a.parameters?.critical && 
        execution.actionExecutions.find(ae => ae.actionId === a.actionId)?.status === 'FAILED'
      );
      
      if (criticalFailure) {
        results.shouldContinue = false;
        results.haltReason = 'Critical action failed';
      }
    }
    
    return results;
  }

  /**
   * Execute a single action with retry and approval logic
   */
  async executeAction(action, execution, playbook, incident, context) {
    try {
      // Evaluate condition
      if (action.condition) {
        const conditionMet = this.evaluateCondition(action.condition, context);
        if (!conditionMet) {
          const actionExecution = {
            actionId: action.actionId,
            actionType: action.actionType,
            stage: action.stage,
            status: 'SKIPPED',
            inputParameters: action.parameters
          };
          
          execution.actionExecutions.push(actionExecution);
          execution.skippedActions = (execution.skippedActions || 0) + 1;
          
          // Create audit
          await this.createActionAudit(execution, action, 'SKIPPED', {}, null);
          
          return { actionId: action.actionId, skipped: true };
        }
      }
      
      // Check approval requirement
      if (action.requiresApproval) {
        const approval = await this.approvalGateService.requestApproval(
          action,
          incident,
          execution
        );
        
        if (approval.status === 'DENIED') {
          const actionExecution = {
            actionId: action.actionId,
            actionType: action.actionType,
            stage: action.stage,
            status: 'SKIPPED',
            approval: {
              required: true,
              deniedReason: approval.reason
            }
          };
          
          execution.actionExecutions.push(actionExecution);
          return { actionId: action.actionId, success: false };
        }
        
        if (approval.status === 'PENDING') {
          // Queue for later or timeout
          await this.waitForApproval(approval);
        }
      }
      
      // Prepare action execution
      const actionExecution = {
        actionId: action.actionId,
        actionType: action.actionType,
        stage: action.stage,
        status: 'EXECUTING',
        startedAt: new Date(),
        inputParameters: action.parameters,
        idempotencyKey: action.idempotencyKey || this.generateIdempotencyKey(action)
      };
      
      execution.actionExecutions.push(actionExecution);
      
      // Execute with retries
      const result = await this.executeWithRetry(
        action,
        execution,
        actionExecution,
        context
      );
      
      actionExecution.completedAt = new Date();
      actionExecution.duration = actionExecution.completedAt - actionExecution.startedAt;
      actionExecution.status = result.success ? 'SUCCESS' : 'FAILED';
      actionExecution.result = result.data;
      
      if (result.error) {
        actionExecution.error = {
          message: result.error.message,
          code: result.error.code,
          stack: result.error.stack
        };
      }
      
      if (result.success) {
        execution.successfulActions = (execution.successfulActions || 0) + 1;
      } else {
        execution.failedActions = (execution.failedActions || 0) + 1;
      }
      
      // Create audit
      await this.createActionAudit(execution, action, actionExecution.status, result.data, result.error);
      
      // Handle compensation if action failed
      if (!result.success && action.compensatingAction) {
        await this.executeCompensation(action, execution, actionExecution);
      }
      
      return { actionId: action.actionId, success: result.success };
      
    } catch (error) {
      console.error(`Action execution error: ${action.actionId}`, error);
      
      // Create failed action execution
      execution.failedActions = (execution.failedActions || 0) + 1;
      await this.createActionAudit(execution, action, 'FAILED', {}, error);
      
      throw error;
    }
  }

  /**
   * Execute action with retry logic
   */
  async executeWithRetry(action, execution, actionExecution, context) {
    const retryConfig = action.retryConfig || { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 };
    let lastError = null;
    
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Check idempotency
        if (attempt > 0 && action.idempotencyKey) {
          const duplicateAudit = await PlaybookActionAudit.findOne({
            idempotencyKey: action.idempotencyKey,
            status: 'SUCCESS'
          });
          
          if (duplicateAudit) {
            console.log(`Idempotent retry detected for ${action.actionId}`);
            actionExecution.isIdempotentRetry = true;
            return { success: true, data: duplicateAudit.result };
          }
        }
        
        // Execute action
        const result = await this.executorService.executeAction(action, execution, context);
        
        return { success: true, data: result };
        
      } catch (error) {
        lastError = error;
        actionExecution.retryCount = attempt + 1;
        
        if (attempt < retryConfig.maxRetries) {
          const backoffMs = retryConfig.backoffMs * Math.pow(retryConfig.backoffMultiplier, attempt);
          
          // Record retry
          actionExecution.retryDetails = actionExecution.retryDetails || [];
          actionExecution.retryDetails.push({
            attemptNumber: attempt + 1,
            startedAt: new Date(),
            error: error.message,
            backoffDelayMs: backoffMs
          });
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    return {
      success: false,
      error: lastError || new Error('Action failed after retries')
    };
  }

  /**
   * Execute compensation action
   */
  async executeCompensation(action, execution, actionExecution) {
    try {
      if (!action.compensatingAction) return;
      
      console.log(`Executing compensation for action ${action.actionId}`);
      
      const compensatingExecution = {
        actionId: `comp_${action.actionId}`,
        actionType: action.compensatingAction.actionType,
        status: 'EXECUTING',
        startedAt: new Date()
      };
      
      actionExecution.compensation = {
        required: true,
        startedAt: new Date(),
        actionType: action.compensatingAction.actionType
      };
      
      // Execute compensation
      const result = await this.executorService.executeAction(
        action.compensatingAction,
        execution,
        {}
      );
      
      actionExecution.compensation.completedAt = new Date();
      actionExecution.compensation.status = 'SUCCESS';
      actionExecution.compensation.result = result;
      
      execution.compensation.required = true;
      
    } catch (error) {
      console.error('Compensation error:', error);
      
      actionExecution.compensation.completedAt = new Date();
      actionExecution.compensation.status = 'FAILED';
      actionExecution.compensation.error = error.message;
      
      // Escalate compensation failure
      execution.addAuditEvent('COMPENSATION_FAILED', {
        actionId: action.actionId,
        error: error.message
      });
    }
  }

  /**
   * Attempt full compensation if execution fails
   */
  async attemptCompensation(execution) {
    try {
      console.log(`Attempting compensation for execution ${execution.executionId}`);
      
      execution.compensation = {
        required: true,
        startedAt: new Date(),
        status: 'EXECUTING',
        failures: []
      };
      
      // Reverse action order for compensation
      const actionsToCompensate = execution.actionExecutions
        .filter(ae => ae.status === 'SUCCESS' && ae.compensation?.required !== true)
        .reverse();
      
      for (const actionExec of actionsToCompensate) {
        try {
          const originalAction = await PlaybookActionAudit.findOne({ 
            'auditId': actionExec.actionId 
          });
          
          if (originalAction?.compensation) {
            await this.executorService.executeAction(
              originalAction.compensation,
              execution,
              {}
            );
          }
        } catch (error) {
          execution.compensation.failures.push({
            actionId: actionExec.actionId,
            error: error.message
          });
        }
      }
      
      execution.compensation.completedAt = new Date();
      execution.compensation.status = 'SUCCESS';
      
    } catch (error) {
      console.error('Full compensation failed:', error);
      execution.compensation.status = 'FAILED';
    }
  }

  /**
   * Create action audit record
   */
  async createActionAudit(execution, action, status, result, error) {
    try {
      const audit = new PlaybookActionAudit({
        auditId: crypto.randomUUID(),
        executionId: execution._id,
        playbookId: execution.playbookId,
        playbookName: execution.playbookName,
        actionId: action.actionId,
        actionType: action.actionType,
        stage: action.stage,
        targetUserId: execution.userId,
        status,
        result,
        error,
        executedBy: 'SYSTEM',
        traceId: execution.traceId,
        idempotencyKey: action.idempotencyKey
      });
      
      await audit.save();
      
    } catch (error) {
      console.error('Error creating action audit:', error);
    }
  }

  /**
   * Find applicable playbooks for incident
   */
  async findApplicablePlaybooks(incident) {
    const query = {
      enabled: true,
      playbookType: incident.incidentType
    };
    
    return await IncidentPlaybook.find(query);
  }

  /**
   * Validate incident context
   */
  async validateIncidentContext(context) {
    if (context.incidentId) {
      const incident = await SecurityIncident.findById(context.incidentId);
      if (!incident) throw new Error('Incident not found');
      return incident;
    }
    
    // Create temporary incident from context
    return {
      _id: crypto.randomUUID(),
      incidentId: context.incidentId || crypto.randomUUID(),
      incidentType: context.incidentType,
      severity: context.severity || 'MEDIUM',
      targetUser: context.userId,
      description: context.description
    };
  }

  /**
   * Calculate final execution status
   */
  calculateExecutionStatus(execution) {
    const totalActions = execution.actionExecutions.length;
    if (totalActions === 0) return 'FAILED';
    
    const successful = execution.actionExecutions.filter(ae => ae.status === 'SUCCESS').length;
    const failed = execution.actionExecutions.filter(ae => ae.status === 'FAILED').length;
    
    if (failed === 0) return 'COMPLETED';
    if (successful === 0) return 'FAILED';
    
    return 'PARTIALLY_COMPLETED';
  }

  /**
   * Group actions by stage
   */
  groupActionsByStage(actions) {
    const grouped = new Map();
    
    for (const action of actions) {
      if (!grouped.has(action.stage)) {
        grouped.set(action.stage, []);
      }
      grouped.get(action.stage).push(action);
    }
    
    return grouped;
  }

  /**
   * Evaluate condition expression
   */
  evaluateCondition(condition, context) {
    try {
      // Safe evaluation of condition
      const func = new Function('context', `return ${condition}`);
      return func(context);
    } catch (error) {
      console.warn(`Condition evaluation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate idempotency key
   */
  generateIdempotencyKey(action) {
    return `${action.actionId}_${Date.now()}`;
  }

  /**
   * Escalate to analyst
   */
  async escalateToAnalyst(execution, reason) {
    try {
      const analysts = await User.find({ role: 'SECURITY_ANALYST' }).limit(5);
      
      for (const analyst of analysts) {
        await notificationService.notifySecurityAlert(analyst._id, {
          title: 'Playbook Execution Escalation',
          message: reason,
          executionId: execution.executionId,
          severity: execution.riskLevel,
          link: `/incidents/executions/${execution.executionId}`
        });
      }
      
      execution.escalations.push({
        escalatedAt: new Date(),
        reason,
        status: 'PENDING'
      });
      
    } catch (error) {
      console.error('Error escalating to analyst:', error);
    }
  }

  /**
   * Notify incident containment
   */
  async notifyIncidentContainment(execution, incident) {
    try {
      await notificationService.notifySecurityAlert(execution.userId, {
        title: 'Incident Contained',
        message: `Incident has been automatically contained by ${execution.playbookName}`,
        executionId: execution.executionId,
        severity: 'INFO'
      });
    } catch (error) {
      console.error('Error notifying incident containment:', error);
    }
  }

  /**
   * Wait for approval
   */
  async waitForApproval(approval) {
    const timeoutMs = approval.approvalTimeoutMs || 3600000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (approval.status !== 'PENDING') {
        return;
      }
      
      // Check every 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    approval.status = 'TIMEOUT';
  }

  /**
   * Convert severity to number for comparison
   */
  severityToNumber(severity) {
    const map = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
    return map[severity] || 0;
  }
}

module.exports = new IncidentPlaybookEngineService();
