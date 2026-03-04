const express = require('express');
const auth = require('../middleware/auth');
const envelopeService = require('../services/envelopeService');
const {
  validateEnvelope,
  validateEnvelopeUpdate,
  validateAllocation,
  validateSpend,
  validateTransfer,
  validateEnvelopeId,
  validateQueryParams
} = require('../middleware/envelopeValidator');

const router = express.Router();

// All routes require authentication
router.use(auth);

/**
 * POST /api/envelopes
 * Create a new envelope
 */
router.post('/', validateEnvelope, async (req, res) => {
  try {
    const envelope = await envelopeService.createEnvelope(req.user._id, req.validatedBody);
    res.status(201).json(envelope);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/envelopes
 * Get all envelopes for the user
 */
router.get('/', validateQueryParams, async (req, res) => {
  try {
    const { period, category, isActive } = req.query;
    
    const filters = {};
    if (period) filters.period = period;
    if (category) filters.category = category;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const envelopes = await envelopeService.getEnvelopes(req.user._id, filters);
    res.json(envelopes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/envelopes/summary
 * Get envelope summary
 */
router.get('/summary', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const summary = await envelopeService.getEnvelopeSummary(req.user._id, period);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/envelopes/alerts
 * Get envelope alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await envelopeService.checkEnvelopeAlerts(req.user._id);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/envelopes/:id
 * Get envelope by ID
 */
router.get('/:id', validateEnvelopeId, async (req, res) => {
  try {
    const envelope = await envelopeService.getEnvelopeById(req.params.id, req.user._id);
    res.json(envelope);
  } catch (error) {
    if (error.message === 'Envelope not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/envelopes/:id
 * Update envelope
 */
router.put('/:id', validateEnvelopeId, validateEnvelopeUpdate, async (req, res) => {
  try {
    const envelope = await envelopeService.updateEnvelope(
      req.params.id,
      req.user._id,
      req.validatedBody
    );
    res.json(envelope);
  } catch (error) {
    if (error.message === 'Envelope not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/envelopes/:id
 * Delete envelope
 */
router.delete('/:id', validateEnvelopeId, async (req, res) => {
  try {
    const result = await envelopeService.deleteEnvelope(req.params.id, req.user._id);
    res.json(result);
  } catch (error) {
    if (error.message === 'Envelope not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/envelopes/:id/allocate
 * Allocate money to envelope
 */
router.post('/:id/allocate', validateEnvelopeId, validateAllocation, async (req, res) => {
  try {
    const envelope = await envelopeService.allocateToEnvelope(
      req.params.id,
      req.user._id,
      req.validatedBody.amount
    );
    res.json(envelope);
  } catch (error) {
    if (error.message === 'Envelope not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Allocation amount must be positive') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/envelopes/:id/spend
 * Spend from envelope
 */
router.post('/:id/spend', validateEnvelopeId, validateSpend, async (req, res) => {
  try {
    const envelope = await envelopeService.spendFromEnvelope(
      req.params.id,
      req.user._id,
      req.validatedBody.amount,
      req.validatedBody.expenseId
    );
    res.json(envelope);
  } catch (error) {
    if (error.message === 'Envelope not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Spend amount must be positive') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/envelopes/transfer
 * Transfer money between envelopes
 */
router.post('/transfer', validateTransfer, async (req, res) => {
  try {
    const { fromEnvelopeId, toEnvelopeId, amount } = req.validatedBody;
    const result = await envelopeService.transferBetweenEnvelopes(
      fromEnvelopeId,
      toEnvelopeId,
      req.user._id,
      amount
    );
    res.json(result);
  } catch (error) {
    if (error.message === 'Source envelope not found' || 
        error.message === 'Destination envelope not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Cannot transfer to the same envelope') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'Insufficient funds in source envelope') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/envelopes/:id/rollover
 * Roll over unused funds to next period
 */
router.post('/:id/rollover', validateEnvelopeId, async (req, res) => {
  try {
    const envelope = await envelopeService.rollOverEnvelope(req.params.id, req.user._id);
    res.json(envelope);
  } catch (error) {
    if (error.message === 'Envelope not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/envelopes/reset
 * Reset all envelopes for a new period
 */
router.post('/reset', async (req, res) => {
  try {
    const { period } = req.body;
    const envelopes = await envelopeService.resetAllEnvelopes(req.user._id, period);
    res.json({ 
      message: 'Envelopes reset successfully', 
      envelopes 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/envelopes/:id/archive
 * Archive envelope
 */
router.post('/:id/archive', validateEnvelopeId, async (req, res) => {
  try {
    const envelope = await envelopeService.archiveEnvelope(req.params.id, req.user._id);
    res.json(envelope);
  } catch (error) {
    if (error.message === 'Envelope not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/envelopes/batch
 * Create multiple envelopes at once
 */
router.post('/batch', async (req, res) => {
  try {
    const { envelopes } = req.body;
    
    if (!Array.isArray(envelopes) || envelopes.length === 0) {
      return res.status(400).json({ error: 'Envelopes array is required' });
    }

    const createdEnvelopes = [];
    
    for (const envelopeData of envelopes) {
      const { error, value } = validateEnvelope.schema.validate(envelopeData);
      
      if (error) {
        logger.warn(`Batch envelope validation error: ${error.details[0].message}`);
        continue;
      }
      
      const envelope = await envelopeService.createEnvelope(req.user._id, value);
      createdEnvelopes.push(envelope);
    }

    res.status(201).json({ 
      message: `${createdEnvelopes.length} envelopes created`,
      envelopes: createdEnvelopes 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
