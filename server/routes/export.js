const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { exportRateLimiter } = require('../middleware/rateLimit');
const exportService = require('../services/exportService');

/**
 * @route   GET /api/export/csv
 * @desc    Export expenses as CSV
 * @access  Private
 */
router.get('/csv', auth, exportRateLimiter, async (req, res) => {
    try {
        const { startDate, endDate, category, type } = req.query;

        const expenses = await exportService.getExpensesForExport(req.user._id, {
            startDate,
            endDate,
            category,
            type
        });

        if (expenses.length === 0) {
            return res.status(404).json({
                error: 'No expenses found for the selected filters'
            });
        }

        const csvContent = exportService.generateCSV(expenses, {
            includeHeaders: true,
            dateFormat: req.query.dateFormat || req.user?.locale || 'en-US'
        });

        // Generate filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `expenseflow_export_${dateStr}.csv`;

        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Export-Count', expenses.length);

        res.send(csvContent);
    } catch (error) {
        console.error('[Export Routes] CSV export error:', error);
        res.status(500).json({ error: 'Failed to generate CSV export' });
    }
});

/**
 * @route   GET /api/export/pdf
 * @desc    Export expenses as PDF report
 * @access  Private
 */
router.get('/pdf', auth, exportRateLimiter, async (req, res) => {
    try {
        const { startDate, endDate, category, type } = req.query;

        const expenses = await exportService.getExpensesForExport(req.user._id, {
            startDate,
            endDate,
            category,
            type
        });

        const pdfBuffer = await exportService.generatePDF(expenses, req.user, {
            startDate,
            endDate
        });

        // Generate filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `expenseflow_report_${dateStr}.pdf`;

        // Set headers for file download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('X-Export-Count', expenses.length);

        res.send(pdfBuffer);
    } catch (error) {
        console.error('[Export Routes] PDF export error:', error);
        res.status(500).json({ error: 'Failed to generate PDF export' });
    }
});

/**
 * @route   GET /api/export/summary
 * @desc    Export monthly summary as JSON
 * @access  Private
 */
router.get('/summary', auth, exportRateLimiter, async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;

        const summary = await exportService.generateMonthlySummary(
            req.user._id,
            year,
            month
        );

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('[Export Routes] Summary export error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

/**
 * @route   GET /api/export/summary/pdf
 * @desc    Export monthly summary as PDF
 * @access  Private
 */
router.get('/summary/pdf', auth, exportRateLimiter, async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;

        // Get start and end of month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);

        const expenses = await exportService.getExpensesForExport(req.user._id, {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });

        const pdfBuffer = await exportService.generatePDF(expenses, req.user, {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });

        // Generate filename with month name
        const monthName = exportService.getMonthName(month);
        const filename = `expenseflow_${monthName}_${year}_report.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        res.send(pdfBuffer);
    } catch (error) {
        console.error('[Export Routes] Monthly PDF export error:', error);
        res.status(500).json({ error: 'Failed to generate monthly PDF report' });
    }
});

/**
 * @route   GET /api/export/preview
 * @desc    Preview export data (returns JSON summary)
 * @access  Private
 */
router.get('/preview', auth, async (req, res) => {
    try {
        const { startDate, endDate, category, type } = req.query;

        const expenses = await exportService.getExpensesForExport(req.user._id, {
            startDate,
            endDate,
            category,
            type
        });

        const stats = exportService.calculateStatistics(expenses);

        res.json({
            success: true,
            data: {
                transactionCount: expenses.length,
                dateRange: exportService.getDateRangeText(startDate, endDate),
                summary: {
                    totalIncome: stats.totalIncome,
                    totalExpense: stats.totalExpense,
                    netBalance: stats.netBalance
                },
                categoryBreakdown: stats.categoryBreakdown,
                preview: expenses.slice(0, 5).map(e => ({
                    date: e.date,
                    description: e.description,
                    category: e.category,
                    type: e.type,
                    amount: e.amount
                }))
            }
        });
    } catch (error) {
        console.error('[Export Routes] Preview error:', error);
        res.status(500).json({ error: 'Failed to generate preview' });
    }
});

/**
 * @route   GET /api/export/formats
 * @desc    Get available export formats
 * @access  Public
 */
router.get('/formats', (req, res) => {
    res.json({
        success: true,
        data: {
            formats: [
                {
                    id: 'csv',
                    name: 'CSV',
                    description: 'Comma-separated values, compatible with Excel and Google Sheets',
                    mimeType: 'text/csv',
                    extension: '.csv'
                },
                {
                    id: 'pdf',
                    name: 'PDF Report',
                    description: 'Formatted PDF report with summary, charts, and transaction details',
                    mimeType: 'application/pdf',
                    extension: '.pdf'
                }
            ],
            filters: [
                { id: 'startDate', name: 'Start Date', type: 'date' },
                { id: 'endDate', name: 'End Date', type: 'date' },
                { id: 'category', name: 'Category', type: 'select' },
                { id: 'type', name: 'Type', type: 'select', options: ['income', 'expense'] }
            ]
        }
    });
});

module.exports = router;
