const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const reportService = require('../services/reportService');
const pdfService = require('../services/pdfService');
const { validateReportGeneration, validateReportList } = require('../middleware/taxValidator');

/**
 * @route   POST /api/reports/generate
 * @desc    Generate a financial report
 * @access  Private
 */
router.post('/generate', auth, validateReportGeneration, async (req, res) => {
  try {
    const {
      reportType,
      startDate,
      endDate,
      currency,
      includeForecasts,
      workspaceId
    } = req.body;

    const report = await reportService.generateReport(req.user.id, reportType, {
      startDate,
      endDate,
      currency,
      includeForecasts,
      workspaceId
    });

    res.status(201).json({
      success: true,
      data: report,
      message: 'Report generated successfully'
    });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report'
    });
  }
});

/**
 * @route   GET /api/reports
 * @desc    Get user's reports
 * @access  Private
 */
router.get('/', auth, validateReportList, async (req, res) => {
  try {
    const { page, limit, reportType, status } = req.query;
    
    const result = await reportService.getUserReports(req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      reportType,
      status
    });

    res.json({
      success: true,
      data: result.reports,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reports'
    });
  }
});

/**
 * @route   GET /api/reports/:id
 * @desc    Get report by ID
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const report = await reportService.getReportById(req.params.id, req.user.id);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get report error:', error);
    if (error.message === 'Report not found') {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to fetch report'
    });
  }
});

/**
 * @route   GET /api/reports/:id/pdf
 * @desc    Download report as PDF
 * @access  Private
 */
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const pdfBuffer = await pdfService.generatePDFForReport(req.params.id, req.user.id);

    // Get report for filename
    const report = await reportService.getReportById(req.params.id, req.user.id);
    const filename = `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    if (error.message === 'Report not found or not ready') {
      return res.status(404).json({
        success: false,
        error: 'Report not found or not ready'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF'
    });
  }
});

/**
 * @route   DELETE /api/reports/:id
 * @desc    Delete a report
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    await reportService.deleteReport(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    if (error.message === 'Report not found') {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to delete report'
    });
  }
});

/**
 * @route   POST /api/reports/quick/:type
 * @desc    Generate quick report (preset date ranges)
 * @access  Private
 */
router.post('/quick/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;
    const { reportType = 'expense_summary' } = req.body;
    
    let startDate, endDate;
    const now = new Date();
    
    switch (type) {
      case 'this-month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last-month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'this-quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
        break;
      case 'this-year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      case 'last-year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case 'financial-year':
        // Indian FY (April to March)
        const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        startDate = new Date(fyStart, 3, 1);
        endDate = new Date(fyStart + 1, 2, 31);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid quick report type. Use: this-month, last-month, this-quarter, this-year, last-year, financial-year'
        });
    }

    const report = await reportService.generateReport(req.user.id, reportType, {
      startDate,
      endDate
    });

    res.status(201).json({
      success: true,
      data: report,
      message: `${type} report generated successfully`
    });
  } catch (error) {
    console.error('Quick report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate quick report'
    });
  }
});

/**
 * @route   GET /api/reports/types/available
 * @desc    Get available report types
 * @access  Private
 */
router.get('/types/available', auth, (req, res) => {
  const reportTypes = [
    {
      type: 'income_statement',
      name: 'Income Statement',
      description: 'Summary of income and expenses with savings rate'
    },
    {
      type: 'expense_summary',
      name: 'Expense Summary',
      description: 'Detailed breakdown of expenses by category'
    },
    {
      type: 'profit_loss',
      name: 'Profit & Loss Statement',
      description: 'Traditional P&L format with operating and discretionary expenses'
    },
    {
      type: 'tax_report',
      name: 'Tax Report',
      description: 'Tax liability calculation with deductions breakdown'
    },
    {
      type: 'category_breakdown',
      name: 'Category Breakdown',
      description: 'Detailed analysis of income and expenses by category'
    },
    {
      type: 'monthly_comparison',
      name: 'Monthly Comparison',
      description: 'Month-over-month financial trends and growth rates'
    },
    {
      type: 'annual_summary',
      name: 'Annual Summary',
      description: 'Comprehensive yearly financial overview'
    }
  ];

  res.json({
    success: true,
    data: reportTypes
  });
});

/**
 * @route   GET /api/reports/preview
 * @desc    Preview report data with charts (for frontend display)
 * @access  Private
 */
router.get('/preview', auth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      reportType = 'comprehensive',
      currency = 'USD'
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate: endDate ? new Date(endDate) : new Date(),
      reportType,
      currency,
      includeCharts: true
    };

    const previewData = await reportService.generatePreview(req.user.id, options);

    res.json({
      success: true,
      data: previewData
    });
  } catch (error) {
    console.error('Report preview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report preview'
    });
  }
});

/**
 * @route   GET /api/reports/pdf/download
 * @desc    Download comprehensive PDF report
 * @access  Private
 */
router.get('/pdf/download', auth, rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      reportType = 'comprehensive',
      includeCharts = 'true',
      includeTransactions = 'true',
      currency = 'USD',
      title
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate: endDate ? new Date(endDate) : new Date(),
      reportType,
      includeCharts: includeCharts === 'true',
      includeTransactions: includeTransactions === 'true',
      currency,
      title: title || `Financial Report - ${new Date().toLocaleDateString()}`
    };

    const pdfBuffer = await reportService.generatePDF(req.user.id, options);
    
    const filename = `ExpenseFlow_Report_${options.startDate.toISOString().split('T')[0]}_to_${options.endDate.toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF report'
    });
  }
});

/**
 * @route   GET /api/reports/excel/download
 * @desc    Download comprehensive Excel report
 * @access  Private
 */
router.get('/excel/download', auth, rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      reportType = 'comprehensive',
      includeAllTransactions = 'true',
      currency = 'USD'
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate: endDate ? new Date(endDate) : new Date(),
      reportType,
      includeAllTransactions: includeAllTransactions === 'true',
      currency
    };

    const excelBuffer = await reportService.generateExcel(req.user.id, options);
    
    const filename = `ExpenseFlow_Report_${options.startDate.toISOString().split('T')[0]}_to_${options.endDate.toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    
    res.send(excelBuffer);
  } catch (error) {
    console.error('Excel download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Excel report'
    });
  }
});

/**
 * @route   POST /api/reports/schedule
 * @desc    Schedule recurring report generation
 * @access  Private
 */
router.post('/schedule', auth, async (req, res) => {
  try {
    const {
      reportType,
      frequency,
      dayOfWeek,
      dayOfMonth,
      format,
      emailDelivery,
      options
    } = req.body;

    // Validate frequency
    const validFrequencies = ['daily', 'weekly', 'monthly', 'quarterly'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid frequency. Use: daily, weekly, monthly, quarterly'
      });
    }

    const schedule = await reportService.scheduleReport(req.user.id, {
      reportType: reportType || 'comprehensive',
      frequency,
      dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
      dayOfMonth: ['monthly', 'quarterly'].includes(frequency) ? dayOfMonth : undefined,
      format: format || 'pdf',
      emailDelivery: emailDelivery !== false,
      options: options || {}
    });

    res.status(201).json({
      success: true,
      data: schedule,
      message: 'Report scheduled successfully'
    });
  } catch (error) {
    console.error('Report scheduling error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule report'
    });
  }
});

/**
 * @route   GET /api/reports/templates
 * @desc    Get available report templates
 * @access  Private
 */
router.get('/templates', auth, (req, res) => {
  const templates = [
    {
      id: 'executive_summary',
      name: 'Executive Summary',
      description: 'High-level financial overview with key metrics and insights',
      sections: ['summary', 'charts', 'insights'],
      formats: ['pdf', 'excel']
    },
    {
      id: 'detailed_analysis',
      name: 'Detailed Financial Analysis',
      description: 'Comprehensive breakdown with all transactions and categories',
      sections: ['summary', 'categories', 'transactions', 'trends', 'charts'],
      formats: ['pdf', 'excel']
    },
    {
      id: 'tax_preparation',
      name: 'Tax Preparation Report',
      description: 'Organized for tax filing with deductible expenses highlighted',
      sections: ['income', 'deductions', 'categories', 'summary'],
      formats: ['pdf', 'excel']
    },
    {
      id: 'budget_review',
      name: 'Budget Review Report',
      description: 'Budget vs actual spending analysis with variance tracking',
      sections: ['budget_comparison', 'variance', 'recommendations'],
      formats: ['pdf', 'excel']
    },
    {
      id: 'monthly_statement',
      name: 'Monthly Statement',
      description: 'Bank statement style monthly transaction summary',
      sections: ['balance', 'transactions', 'summary'],
      formats: ['pdf']
    }
  ];

  res.json({
    success: true,
    data: templates
  });
});

module.exports = router;
