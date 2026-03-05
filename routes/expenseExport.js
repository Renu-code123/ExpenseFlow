const express = require('express');
const exportService = require('../services/exportService');
const auth = require('../middleware/auth');

const router = express.Router();

// GET export expenses to CSV
router.get('/export', auth, async (req, res) => {
  try {
    const { format, startDate, endDate, category } = req.query;

    // Validate format
    if (format && format !== 'csv') {
      return res.status(400).json({ error: 'Only CSV format is supported' });
    }

    // Get expenses using export service
    const expenses = await exportService.getExpensesForExport(req.user._id, {
      startDate,
      endDate,
      category,
      type: 'all' // Include both income and expenses
    });

    if (expenses.length === 0) {
      return res.status(404).json({ error: 'No expenses found for the selected filters' });
    }

    // Generate CSV using ExportService
    const csv = exportService.generateCSV(expenses);

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');

    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export expenses' });
  }
});

module.exports = router;
