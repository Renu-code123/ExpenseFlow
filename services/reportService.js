const FinancialReport = require('../models/FinancialReport');
const Expense = require('../models/Expense');
const TaxProfile = require('../models/TaxProfile');
const Budget = require('../models/Budget');
const taxService = require('./taxService');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Chart generation for server-side rendering
let ChartJSNodeCanvas;
try {
  ChartJSNodeCanvas = require('chartjs-node-canvas').ChartJSNodeCanvas;
} catch (e) {
  console.log('chartjs-node-canvas not available, charts will be disabled');
}

class ReportService {
  constructor() {
    this.chartWidth = 600;
    this.chartHeight = 400;
    this.chartRenderer = ChartJSNodeCanvas ? new ChartJSNodeCanvas({
      width: this.chartWidth,
      height: this.chartHeight,
      backgroundColour: 'white'
    }) : null;
    
    this.colors = {
      primary: '#4F46E5',
      secondary: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      categories: [
        '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
      ]
    };
  }

  /**
   * Generate report
   */
  async generateReport(userId, reportType, options = {}) {
    const {
      startDate = new Date(new Date().getFullYear(), 0, 1),
      endDate = new Date(),
      currency = 'INR',
      includeForecasts = false,
      workspaceId = null
    } = options;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check for existing report
    const existingReport = await FinancialReport.findOne({
      user: userId,
      reportType,
      'dateRange.startDate': start,
      'dateRange.endDate': end,
      status: { $in: ['ready', 'processing'] }
    });

    if (existingReport && existingReport.status === 'ready') {
      return existingReport;
    }

    // Create new report
    const report = new FinancialReport({
      user: userId,
      reportType,
      title: this.generateTitle(reportType, start, end),
      dateRange: { startDate: start, endDate: end },
      currency,
      workspace: workspaceId,
      status: 'processing'
    });

    await report.save();

    try {
      // Generate report data based on type
      let reportData;
      switch (reportType) {
        case 'income_statement':
          reportData = await this.generateIncomeStatement(userId, start, end);
          break;
        case 'expense_summary':
          reportData = await this.generateExpenseSummary(userId, start, end);
          break;
        case 'profit_loss':
          reportData = await this.generateProfitLoss(userId, start, end);
          break;
        case 'tax_report':
          reportData = await this.generateTaxReport(userId, start, end);
          break;
        case 'category_breakdown':
          reportData = await this.generateCategoryBreakdown(userId, start, end);
          break;
        case 'monthly_comparison':
          reportData = await this.generateMonthlyComparison(userId, start, end);
          break;
        case 'annual_summary':
          reportData = await this.generateAnnualSummary(userId, start, end);
          break;
        default:
          throw new Error(`Unknown report type: ${reportType}`);
      }

      // Update report with data
      Object.assign(report, reportData);
      report.status = 'ready';
      report.generatedAt = new Date();
      
      await report.save();
      return report;
    } catch (error) {
      report.status = 'failed';
      report.error = error.message;
      await report.save();
      throw error;
    }
  }

  /**
   * Generate income statement
   */
  async generateIncomeStatement(userId, startDate, endDate) {
    const [income, expenses] = await Promise.all([
      Expense.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            type: 'income',
            date: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),
      Expense.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            type: 'expense',
            date: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalIncome = income.reduce((sum, i) => sum + i.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);

    return {
      incomeBreakdown: income.map(i => ({
        category: i._id || 'Other',
        amount: i.total,
        count: i.count
      })),
      expenseBreakdown: expenses.map(e => ({
        category: e._id || 'Other',
        amount: e.total,
        count: e.count
      })),
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(2) : 0,
      summary: {
        grossIncome: totalIncome,
        operatingExpenses: totalExpenses,
        netProfit: totalIncome - totalExpenses,
        profitMargin: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(2) : 0
      }
    };
  }

  /**
   * Generate expense summary
   */
  async generateExpenseSummary(userId, startDate, endDate) {
    const [categoryBreakdown, monthlyTrends, topExpenses] = await Promise.all([
      Expense.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            type: 'expense',
            date: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
            avgAmount: { $avg: '$amount' }
          }
        },
        { $sort: { total: -1 } }
      ]),
      Expense.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            type: 'expense',
            date: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      Expense.find({
        user: userId,
        type: 'expense',
        date: { $gte: startDate, $lte: endDate }
      })
        .sort({ amount: -1 })
        .limit(10)
        .select('description amount category date')
    ]);

    const totalExpenses = categoryBreakdown.reduce((sum, c) => sum + c.total, 0);

    return {
      expenseBreakdown: categoryBreakdown.map(c => ({
        category: c._id || 'Other',
        amount: c.total,
        count: c.count,
        avgAmount: Math.round(c.avgAmount),
        percentage: totalExpenses > 0 ? ((c.total / totalExpenses) * 100).toFixed(2) : 0
      })),
      totalExpenses,
      monthlyTrends: monthlyTrends.map(m => ({
        month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
        income: 0,
        expenses: m.total,
        netSavings: -m.total,
        transactionCount: m.count
      })),
      topExpenses: topExpenses.map(e => ({
        description: e.description,
        amount: e.amount,
        category: e.category,
        date: e.date
      })),
      averageMonthlyExpense: monthlyTrends.length > 0 
        ? totalExpenses / monthlyTrends.length 
        : 0
    };
  }

  /**
   * Generate profit/loss statement
   */
  async generateProfitLoss(userId, startDate, endDate) {
    const data = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            type: '$type',
            category: '$category'
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const income = data.filter(d => d._id.type === 'income');
    const expenses = data.filter(d => d._id.type === 'expense');

    const totalIncome = income.reduce((sum, i) => sum + i.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);
    const netIncome = totalIncome - totalExpenses;

    // Categorize expenses
    const operatingExpenses = expenses
      .filter(e => ['utilities', 'transport', 'food'].includes(e._id.category))
      .reduce((sum, e) => sum + e.total, 0);
    
    const discretionaryExpenses = expenses
      .filter(e => ['shopping', 'entertainment'].includes(e._id.category))
      .reduce((sum, e) => sum + e.total, 0);

    const essentialExpenses = expenses
      .filter(e => ['healthcare'].includes(e._id.category))
      .reduce((sum, e) => sum + e.total, 0);

    return {
      incomeBreakdown: income.map(i => ({
        category: i._id.category || 'Other',
        amount: i.total,
        count: i.count
      })),
      expenseBreakdown: expenses.map(e => ({
        category: e._id.category || 'Other',
        amount: e.total,
        count: e.count
      })),
      totalIncome,
      totalExpenses,
      netIncome,
      summary: {
        grossIncome: totalIncome,
        operatingExpenses,
        discretionaryExpenses,
        essentialExpenses,
        otherExpenses: totalExpenses - operatingExpenses - discretionaryExpenses - essentialExpenses,
        netProfit: netIncome,
        profitMargin: totalIncome > 0 ? ((netIncome / totalIncome) * 100).toFixed(2) : 0
      }
    };
  }

  /**
   * Generate tax report
   */
  async generateTaxReport(userId, startDate, endDate) {
    const taxYear = startDate.getFullYear();
    
    // Get tax calculation
    const taxCalc = await taxService.calculateTax(userId, taxYear);
    
    // Get deductible expenses
    const deductibleExpenses = await taxService.getDeductibleExpenses(userId, startDate, endDate);
    
    return {
      totalIncome: taxCalc.grossIncome,
      totalExpenses: 0, // Will be filled from expense data
      netIncome: taxCalc.taxableIncome,
      taxDeductions: deductibleExpenses.map(d => ({
        category: d.category,
        section: d.section,
        amount: d.totalAmount,
        deductible: d.deductibleAmount
      })),
      taxSummary: {
        grossIncome: taxCalc.grossIncome,
        totalDeductions: taxCalc.totalDeductions,
        taxableIncome: taxCalc.taxableIncome,
        taxLiability: taxCalc.totalTax,
        effectiveRate: taxCalc.effectiveRate,
        regime: taxCalc.regime
      }
    };
  }

  /**
   * Generate category breakdown
   */
  async generateCategoryBreakdown(userId, startDate, endDate) {
    const breakdown = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            type: '$type',
            category: '$category'
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' },
          minAmount: { $min: '$amount' },
          maxAmount: { $max: '$amount' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    const incomeData = breakdown.filter(b => b._id.type === 'income');
    const expenseData = breakdown.filter(b => b._id.type === 'expense');

    const totalIncome = incomeData.reduce((sum, i) => sum + i.total, 0);
    const totalExpenses = expenseData.reduce((sum, e) => sum + e.total, 0);

    return {
      incomeBreakdown: incomeData.map(i => ({
        category: i._id.category || 'Other',
        amount: i.total,
        count: i.count,
        percentage: totalIncome > 0 ? ((i.total / totalIncome) * 100).toFixed(2) : 0
      })),
      expenseBreakdown: expenseData.map(e => ({
        category: e._id.category || 'Other',
        amount: e.total,
        count: e.count,
        avgAmount: Math.round(e.avgAmount),
        minAmount: e.minAmount,
        maxAmount: e.maxAmount,
        percentage: totalExpenses > 0 ? ((e.total / totalExpenses) * 100).toFixed(2) : 0
      })),
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses
    };
  }

  /**
   * Generate monthly comparison
   */
  async generateMonthlyComparison(userId, startDate, endDate) {
    const monthlyData = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type'
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Transform into monthly trends
    const monthlyMap = new Map();
    
    for (const data of monthlyData) {
      const key = `${data._id.year}-${String(data._id.month).padStart(2, '0')}`;
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          month: key,
          income: 0,
          expenses: 0,
          netSavings: 0,
          transactionCount: 0
        });
      }
      
      const entry = monthlyMap.get(key);
      if (data._id.type === 'income') {
        entry.income = data.total;
      } else {
        entry.expenses = data.total;
      }
      entry.transactionCount += data.count;
      entry.netSavings = entry.income - entry.expenses;
    }

    const monthlyTrends = Array.from(monthlyMap.values());
    
    const totalIncome = monthlyTrends.reduce((sum, m) => sum + m.income, 0);
    const totalExpenses = monthlyTrends.reduce((sum, m) => sum + m.expenses, 0);

    // Calculate growth rates
    for (let i = 1; i < monthlyTrends.length; i++) {
      const prev = monthlyTrends[i - 1];
      const curr = monthlyTrends[i];
      
      curr.incomeGrowth = prev.income > 0 
        ? ((curr.income - prev.income) / prev.income * 100).toFixed(2) 
        : 0;
      curr.expenseGrowth = prev.expenses > 0 
        ? ((curr.expenses - prev.expenses) / prev.expenses * 100).toFixed(2) 
        : 0;
    }

    return {
      monthlyTrends,
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      averageMonthlyIncome: monthlyTrends.length > 0 ? totalIncome / monthlyTrends.length : 0,
      averageMonthlyExpense: monthlyTrends.length > 0 ? totalExpenses / monthlyTrends.length : 0
    };
  }

  /**
   * Generate annual summary
   */
  async generateAnnualSummary(userId, startDate, endDate) {
    const [incomeStatement, categoryBreakdown, monthlyComp] = await Promise.all([
      this.generateIncomeStatement(userId, startDate, endDate),
      this.generateCategoryBreakdown(userId, startDate, endDate),
      this.generateMonthlyComparison(userId, startDate, endDate)
    ]);

    // Find highest and lowest months
    const months = monthlyComp.monthlyTrends;
    const highestExpenseMonth = months.reduce((max, m) => m.expenses > max.expenses ? m : max, months[0] || { expenses: 0 });
    const lowestExpenseMonth = months.reduce((min, m) => m.expenses < min.expenses ? m : min, months[0] || { expenses: 0 });

    return {
      totalIncome: incomeStatement.totalIncome,
      totalExpenses: incomeStatement.totalExpenses,
      netIncome: incomeStatement.netIncome,
      savingsRate: incomeStatement.savingsRate,
      incomeBreakdown: incomeStatement.incomeBreakdown,
      expenseBreakdown: categoryBreakdown.expenseBreakdown,
      monthlyTrends: monthlyComp.monthlyTrends,
      summary: {
        ...incomeStatement.summary,
        averageMonthlyIncome: monthlyComp.averageMonthlyIncome,
        averageMonthlyExpense: monthlyComp.averageMonthlyExpense,
        highestExpenseMonth: highestExpenseMonth?.month,
        highestExpenseAmount: highestExpenseMonth?.expenses || 0,
        lowestExpenseMonth: lowestExpenseMonth?.month,
        lowestExpenseAmount: lowestExpenseMonth?.expenses || 0
      }
    };
  }

  /**
   * Get user's reports
   */
  async getUserReports(userId, options = {}) {
    const {
      page = 1,
      limit = 10,
      reportType,
      status = 'ready'
    } = options;

    const query = { user: userId };
    if (reportType) query.reportType = reportType;
    if (status) query.status = status;

    const [reports, total] = await Promise.all([
      FinancialReport.find(query)
        .sort({ generatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      FinancialReport.countDocuments(query)
    ]);

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get report by ID
   */
  async getReportById(reportId, userId) {
    const report = await FinancialReport.findOne({
      _id: reportId,
      user: userId
    });

    if (!report) {
      throw new Error('Report not found');
    }

    return report;
  }

  /**
   * Delete report
   */
  async deleteReport(reportId, userId) {
    const result = await FinancialReport.deleteOne({
      _id: reportId,
      user: userId
    });

    if (result.deletedCount === 0) {
      throw new Error('Report not found');
    }

    return { success: true };
  }

  /**
   * Generate report title
   */
  generateTitle(reportType, startDate, endDate) {
    const typeNames = {
      income_statement: 'Income Statement',
      expense_summary: 'Expense Summary',
      profit_loss: 'Profit & Loss Statement',
      tax_report: 'Tax Report',
      category_breakdown: 'Category Breakdown',
      monthly_comparison: 'Monthly Comparison',
      annual_summary: 'Annual Summary'
    };

    const formatDate = (date) => date.toLocaleDateString('en-US', { 
      month: 'short', 
      year: 'numeric' 
    });

    return `${typeNames[reportType] || reportType} - ${formatDate(startDate)} to ${formatDate(endDate)}`;
  }

  // ============ PDF GENERATION ============

  /**
   * Generate professional PDF report with charts
   */
  async generatePDF(userId, options = {}) {
    const {
      startDate = new Date(new Date().getFullYear(), 0, 1),
      endDate = new Date(),
      workspaceId = null,
      includeCharts = true
    } = options;

    // Get report data
    const annualData = await this.generateAnnualSummary(userId, new Date(startDate), new Date(endDate));
    const categoryData = await this.generateCategoryBreakdown(userId, new Date(startDate), new Date(endDate));
    
    // Generate charts if available
    let charts = {};
    if (includeCharts && this.chartRenderer) {
      try {
        charts = await this.generateCharts(categoryData, annualData);
      } catch (e) {
        console.error('Chart generation error:', e);
      }
    }
    
    return new Promise((resolve, reject) => {
      const chunks = [];
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        info: {
          Title: 'Professional Financial Report',
          Author: 'ExpenseFlow',
          Subject: 'Financial Analysis Report'
        }
      });
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Cover Page
      this.renderPDFCoverPage(doc, annualData, new Date(startDate), new Date(endDate));
      
      // Executive Summary
      doc.addPage();
      this.renderPDFExecutiveSummary(doc, annualData);
      
      // Category Breakdown
      doc.addPage();
      this.renderPDFCategoryBreakdown(doc, categoryData, charts.category);
      
      // Monthly Trends
      doc.addPage();
      this.renderPDFMonthlyTrends(doc, annualData, charts.trend);
      
      // Transaction Details
      doc.addPage();
      this.renderPDFTransactions(doc, userId, new Date(startDate), new Date(endDate));
      
      doc.end();
    });
  }

  /**
   * Generate charts for PDF
   */
  async generateCharts(categoryData, annualData) {
    const charts = {};
    
    // Category Pie Chart
    if (categoryData.expenseBreakdown && categoryData.expenseBreakdown.length > 0) {
      const categoryConfig = {
        type: 'pie',
        data: {
          labels: categoryData.expenseBreakdown.slice(0, 8).map(c => c.category),
          datasets: [{
            data: categoryData.expenseBreakdown.slice(0, 8).map(c => c.amount),
            backgroundColor: this.colors.categories.slice(0, 8),
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { position: 'right' },
            title: {
              display: true,
              text: 'Spending by Category',
              font: { size: 18, weight: 'bold' }
            }
          }
        }
      };
      
      charts.category = await this.chartRenderer.renderToBuffer(categoryConfig);
    }
    
    // Monthly Trend Chart
    if (annualData.monthlyTrends && annualData.monthlyTrends.length > 0) {
      const trendConfig = {
        type: 'bar',
        data: {
          labels: annualData.monthlyTrends.map(m => m.month),
          datasets: [
            {
              label: 'Income',
              data: annualData.monthlyTrends.map(m => m.income),
              backgroundColor: this.colors.secondary + '80',
              borderColor: this.colors.secondary,
              borderWidth: 1
            },
            {
              label: 'Expenses',
              data: annualData.monthlyTrends.map(m => m.expenses),
              backgroundColor: this.colors.danger + '80',
              borderColor: this.colors.danger,
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { position: 'top' },
            title: {
              display: true,
              text: 'Monthly Income vs Expenses',
              font: { size: 18, weight: 'bold' }
            }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      };
      
      charts.trend = await this.chartRenderer.renderToBuffer(trendConfig);
    }
    
    return charts;
  }

  /**
   * Render PDF cover page
   */
  renderPDFCoverPage(doc, data, startDate, endDate) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    
    // Background
    doc.rect(0, 0, pageWidth, pageHeight).fill('#4F46E5');
    
    // Title
    doc.fillColor('#ffffff')
       .fontSize(42)
       .font('Helvetica-Bold')
       .text('Financial Report', 50, 200, { align: 'center' });
    
    // Subtitle
    doc.fontSize(18)
       .font('Helvetica')
       .text('Professional Expense Analysis', 50, 260, { align: 'center' });
    
    // Date Range
    doc.fontSize(14)
       .text(`${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, 50, 320, { align: 'center' });
    
    // Summary Box
    doc.roundedRect(100, 400, pageWidth - 200, 150, 10)
       .fillOpacity(0.2)
       .fill('#ffffff');
    
    doc.fillOpacity(1).fillColor('#ffffff');
    
    // Stats
    const stats = [
      { label: 'Total Income', value: `$${(data.totalIncome || 0).toLocaleString()}` },
      { label: 'Total Expenses', value: `$${(data.totalExpenses || 0).toLocaleString()}` },
      { label: 'Savings Rate', value: `${data.savingsRate || 0}%` }
    ];
    
    let xPos = 130;
    stats.forEach(stat => {
      doc.fontSize(12).text(stat.label, xPos, 430, { width: 140, align: 'center' });
      doc.fontSize(20).font('Helvetica-Bold').text(stat.value, xPos, 455, { width: 140, align: 'center' });
      doc.font('Helvetica');
      xPos += 150;
    });
    
    // Footer
    doc.fontSize(10)
       .text('Generated by ExpenseFlow', 50, pageHeight - 80, { align: 'center' })
       .text(new Date().toLocaleDateString(), 50, pageHeight - 65, { align: 'center' });
  }

  /**
   * Render PDF executive summary
   */
  renderPDFExecutiveSummary(doc, data) {
    doc.fillColor('#1F2937').fontSize(24).font('Helvetica-Bold')
       .text('Executive Summary', 50, 50);
    
    doc.moveTo(50, 85).lineTo(545, 85).stroke('#E5E7EB');
    
    let y = 110;
    
    // Key Metrics
    const metrics = [
      { label: 'Total Income', value: `$${(data.totalIncome || 0).toLocaleString()}`, color: this.colors.secondary },
      { label: 'Total Expenses', value: `$${(data.totalExpenses || 0).toLocaleString()}`, color: this.colors.danger },
      { label: 'Net Savings', value: `$${(data.netIncome || 0).toLocaleString()}`, color: data.netIncome >= 0 ? this.colors.secondary : this.colors.danger },
      { label: 'Savings Rate', value: `${data.savingsRate || 0}%`, color: this.colors.primary },
      { label: 'Avg Monthly Income', value: `$${Math.round(data.summary?.averageMonthlyIncome || 0).toLocaleString()}`, color: this.colors.primary },
      { label: 'Avg Monthly Expense', value: `$${Math.round(data.summary?.averageMonthlyExpense || 0).toLocaleString()}`, color: this.colors.warning }
    ];
    
    const colWidth = 160;
    const rowHeight = 70;
    
    metrics.forEach((metric, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = 50 + col * colWidth;
      const boxY = y + row * rowHeight;
      
      doc.roundedRect(x, boxY, colWidth - 10, rowHeight - 10, 5)
         .fillOpacity(0.1).fill(metric.color);
      
      doc.fillOpacity(1).fillColor('#6B7280').fontSize(10).font('Helvetica')
         .text(metric.label, x + 10, boxY + 15);
      
      doc.fillColor(metric.color).fontSize(18).font('Helvetica-Bold')
         .text(metric.value, x + 10, boxY + 35);
    });
    
    y += rowHeight * 2 + 40;
    
    // Insights
    doc.fillColor('#1F2937').fontSize(16).font('Helvetica-Bold')
       .text('Key Insights', 50, y);
    
    y += 30;
    
    const insights = [
      data.savingsRate > 20 ? `Strong savings rate of ${data.savingsRate}% - above recommended 20%` : `Savings rate is ${data.savingsRate}% - aim for 20% or higher`,
      data.summary?.highestExpenseMonth ? `Highest spending in ${data.summary.highestExpenseMonth}: $${data.summary.highestExpenseAmount?.toLocaleString()}` : null,
      data.expenseBreakdown?.[0] ? `Top expense category: ${data.expenseBreakdown[0].category} (${data.expenseBreakdown[0].percentage}%)` : null
    ].filter(Boolean);
    
    insights.forEach(insight => {
      doc.fillColor('#4B5563').fontSize(11).font('Helvetica')
         .text(`• ${insight}`, 60, y, { width: 480 });
      y += 25;
    });
  }

  /**
   * Render PDF category breakdown
   */
  renderPDFCategoryBreakdown(doc, data, chartImage) {
    doc.fillColor('#1F2937').fontSize(24).font('Helvetica-Bold')
       .text('Category Breakdown', 50, 50);
    
    doc.moveTo(50, 85).lineTo(545, 85).stroke('#E5E7EB');
    
    let y = 100;
    
    // Chart
    if (chartImage) {
      doc.image(chartImage, 75, y, { width: 450 });
      y = 500;
    }
    
    // Category Table
    doc.fillColor('#1F2937').fontSize(14).font('Helvetica-Bold')
       .text('Category Details', 50, y);
    
    y += 25;
    
    // Table Header
    doc.fillColor('#6B7280').fontSize(9).font('Helvetica-Bold');
    doc.text('Category', 50, y);
    doc.text('Amount', 200, y, { width: 80, align: 'right' });
    doc.text('Count', 290, y, { width: 50, align: 'right' });
    doc.text('% of Total', 350, y, { width: 70, align: 'right' });
    
    y += 20;
    doc.moveTo(50, y).lineTo(420, y).stroke('#E5E7EB');
    y += 10;
    
    // Table Rows
    (data.expenseBreakdown || []).slice(0, 10).forEach((cat, idx) => {
      if (y > 750) return;
      
      doc.fillColor('#4B5563').fontSize(10).font('Helvetica');
      doc.text(cat.category || 'Other', 50, y, { width: 140 });
      doc.text(`$${(cat.amount || 0).toLocaleString()}`, 200, y, { width: 80, align: 'right' });
      doc.text((cat.count || 0).toString(), 290, y, { width: 50, align: 'right' });
      doc.text(`${cat.percentage || 0}%`, 350, y, { width: 70, align: 'right' });
      
      y += 22;
    });
  }

  /**
   * Render PDF monthly trends
   */
  renderPDFMonthlyTrends(doc, data, chartImage) {
    doc.fillColor('#1F2937').fontSize(24).font('Helvetica-Bold')
       .text('Monthly Trends', 50, 50);
    
    doc.moveTo(50, 85).lineTo(545, 85).stroke('#E5E7EB');
    
    let y = 100;
    
    // Chart
    if (chartImage) {
      doc.image(chartImage, 50, y, { width: 500 });
      y = 520;
    }
    
    // Monthly Table
    doc.fillColor('#1F2937').fontSize(14).font('Helvetica-Bold')
       .text('Monthly Summary', 50, y);
    
    y += 25;
    
    // Table Header
    doc.fillColor('#6B7280').fontSize(9).font('Helvetica-Bold');
    doc.text('Month', 50, y);
    doc.text('Income', 150, y, { width: 80, align: 'right' });
    doc.text('Expenses', 240, y, { width: 80, align: 'right' });
    doc.text('Net', 330, y, { width: 80, align: 'right' });
    
    y += 20;
    doc.moveTo(50, y).lineTo(420, y).stroke('#E5E7EB');
    y += 10;
    
    (data.monthlyTrends || []).slice(-8).forEach(month => {
      if (y > 750) return;
      
      doc.fillColor('#4B5563').fontSize(10).font('Helvetica');
      doc.text(month.month, 50, y);
      doc.text(`$${(month.income || 0).toLocaleString()}`, 150, y, { width: 80, align: 'right' });
      doc.text(`$${(month.expenses || 0).toLocaleString()}`, 240, y, { width: 80, align: 'right' });
      
      const net = month.netSavings || (month.income - month.expenses);
      doc.fillColor(net >= 0 ? this.colors.secondary : this.colors.danger);
      doc.text(`$${net.toLocaleString()}`, 330, y, { width: 80, align: 'right' });
      
      y += 22;
    });
  }

  /**
   * Render PDF transactions
   */
  async renderPDFTransactions(doc, userId, startDate, endDate) {
    doc.fillColor('#1F2937').fontSize(24).font('Helvetica-Bold')
       .text('Recent Transactions', 50, 50);
    
    doc.moveTo(50, 85).lineTo(545, 85).stroke('#E5E7EB');
    
    // Fetch transactions
    const transactions = await Expense.find({
      user: userId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: -1 }).limit(30).lean();
    
    let y = 110;
    
    // Table Header
    doc.fillColor('#6B7280').fontSize(9).font('Helvetica-Bold');
    doc.text('Date', 50, y);
    doc.text('Description', 120, y, { width: 200 });
    doc.text('Category', 330, y, { width: 80 });
    doc.text('Amount', 420, y, { width: 80, align: 'right' });
    
    y += 20;
    doc.moveTo(50, y).lineTo(500, y).stroke('#E5E7EB');
    y += 10;
    
    transactions.forEach(tx => {
      if (y > 750) return;
      
      doc.fillColor('#4B5563').fontSize(9).font('Helvetica');
      doc.text(new Date(tx.date).toLocaleDateString(), 50, y, { width: 60 });
      doc.text((tx.description || 'N/A').substring(0, 35), 120, y, { width: 200 });
      doc.text(tx.category || 'Uncategorized', 330, y, { width: 80 });
      
      doc.fillColor(tx.type === 'expense' ? this.colors.danger : this.colors.secondary);
      doc.text(`${tx.type === 'expense' ? '-' : '+'}$${(tx.amount || 0).toLocaleString()}`, 420, y, { width: 80, align: 'right' });
      
      y += 18;
    });
    
    if (transactions.length >= 30) {
      doc.fillColor('#9CA3AF').fontSize(10).font('Helvetica-Oblique')
         .text('... showing last 30 transactions', 50, y + 10, { align: 'center' });
    }
  }

  // ============ EXCEL GENERATION ============

  /**
   * Generate Excel report
   */
  async generateExcel(userId, options = {}) {
    const {
      startDate = new Date(new Date().getFullYear(), 0, 1),
      endDate = new Date(),
      workspaceId = null
    } = options;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get all report data
    const [annualData, categoryData, transactions] = await Promise.all([
      this.generateAnnualSummary(userId, start, end),
      this.generateCategoryBreakdown(userId, start, end),
      Expense.find({
        user: userId,
        date: { $gte: start, $lte: end }
      }).sort({ date: -1 }).lean()
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ExpenseFlow';
    workbook.created = new Date();

    // Summary Sheet
    this.createExcelSummarySheet(workbook, annualData, start, end);

    // Transactions Sheet
    this.createExcelTransactionsSheet(workbook, transactions);

    // Category Breakdown Sheet
    this.createExcelCategorySheet(workbook, categoryData);

    // Monthly Trends Sheet
    this.createExcelTrendsSheet(workbook, annualData);

    return workbook.xlsx.writeBuffer();
  }

  /**
   * Create Excel summary sheet
   */
  createExcelSummarySheet(workbook, data, startDate, endDate) {
    const sheet = workbook.addWorksheet('Summary', {
      properties: { tabColor: { argb: '4F46E5' } }
    });

    // Title
    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = 'Financial Report Summary';
    sheet.getCell('A1').font = { size: 18, bold: true, color: { argb: '4F46E5' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    // Date Range
    sheet.mergeCells('A2:D2');
    sheet.getCell('A2').value = `Report Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Summary Metrics
    const metrics = [
      ['Total Income', data.totalIncome || 0],
      ['Total Expenses', data.totalExpenses || 0],
      ['Net Savings', data.netIncome || 0],
      ['Savings Rate', `${data.savingsRate || 0}%`],
      ['Avg Monthly Income', data.summary?.averageMonthlyIncome || 0],
      ['Avg Monthly Expense', data.summary?.averageMonthlyExpense || 0]
    ];

    let row = 4;
    metrics.forEach(([label, value]) => {
      sheet.getCell(`A${row}`).value = label;
      sheet.getCell(`A${row}`).font = { bold: true };
      sheet.getCell(`B${row}`).value = typeof value === 'number' ? value : value;
      if (typeof value === 'number') {
        sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
      }
      row++;
    });

    sheet.getColumn('A').width = 25;
    sheet.getColumn('B').width = 20;
  }

  /**
   * Create Excel transactions sheet
   */
  createExcelTransactionsSheet(workbook, transactions) {
    const sheet = workbook.addWorksheet('Transactions', {
      properties: { tabColor: { argb: '10B981' } }
    });

    // Headers
    const headers = ['Date', 'Description', 'Category', 'Type', 'Amount', 'Currency'];
    sheet.addRow(headers);

    // Style header
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F46E5' }
    };

    // Data rows
    transactions.forEach(tx => {
      const row = sheet.addRow([
        new Date(tx.date),
        tx.description || '',
        tx.category || 'Uncategorized',
        tx.type,
        tx.amount,
        tx.currency || 'USD'
      ]);

      if (tx.type === 'expense') {
        row.getCell(5).font = { color: { argb: 'EF4444' } };
      } else {
        row.getCell(5).font = { color: { argb: '10B981' } };
      }
    });

    // Format columns
    sheet.getColumn(1).width = 12;
    sheet.getColumn(1).numFmt = 'yyyy-mm-dd';
    sheet.getColumn(2).width = 40;
    sheet.getColumn(3).width = 18;
    sheet.getColumn(4).width = 10;
    sheet.getColumn(5).width = 15;
    sheet.getColumn(5).numFmt = '$#,##0.00';
    sheet.getColumn(6).width = 10;

    sheet.autoFilter = { from: 'A1', to: 'F1' };
  }

  /**
   * Create Excel category sheet
   */
  createExcelCategorySheet(workbook, data) {
    const sheet = workbook.addWorksheet('Categories', {
      properties: { tabColor: { argb: 'F59E0B' } }
    });

    sheet.addRow(['Category', 'Total Amount', 'Transaction Count', 'Percentage']);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F46E5' }
    };

    (data.expenseBreakdown || []).forEach(cat => {
      sheet.addRow([
        cat.category || 'Other',
        cat.amount || 0,
        cat.count || 0,
        (parseFloat(cat.percentage) || 0) / 100
      ]);
    });

    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(2).numFmt = '$#,##0.00';
    sheet.getColumn(3).width = 18;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(4).numFmt = '0.0%';
  }

  /**
   * Create Excel trends sheet
   */
  createExcelTrendsSheet(workbook, data) {
    const sheet = workbook.addWorksheet('Monthly Trends', {
      properties: { tabColor: { argb: '8B5CF6' } }
    });

    sheet.addRow(['Month', 'Income', 'Expenses', 'Net Savings']);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F46E5' }
    };

    (data.monthlyTrends || []).forEach(month => {
      const net = month.netSavings || (month.income - month.expenses);
      const row = sheet.addRow([month.month, month.income || 0, month.expenses || 0, net]);
      
      if (net < 0) {
        row.getCell(4).font = { color: { argb: 'EF4444' } };
      } else {
        row.getCell(4).font = { color: { argb: '10B981' } };
      }
    });

    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(2).numFmt = '$#,##0.00';
    sheet.getColumn(3).width = 15;
    sheet.getColumn(3).numFmt = '$#,##0.00';
    sheet.getColumn(4).width = 15;
    sheet.getColumn(4).numFmt = '$#,##0.00';
  }

  /**
   * Generate preview data for frontend
   */
  async generatePreview(userId, options = {}) {
    const {
      startDate = new Date(new Date().getFullYear(), 0, 1),
      endDate = new Date()
    } = options;

    const start = new Date(startDate);
    const end = new Date(endDate);

    const [annualData, categoryData] = await Promise.all([
      this.generateAnnualSummary(userId, start, end),
      this.generateCategoryBreakdown(userId, start, end)
    ]);

    // Generate chart images as base64 if possible
    let charts = {};
    if (this.chartRenderer) {
      try {
        const chartBuffers = await this.generateCharts(categoryData, annualData);
        if (chartBuffers.category) {
          charts.category = `data:image/png;base64,${chartBuffers.category.toString('base64')}`;
        }
        if (chartBuffers.trend) {
          charts.trend = `data:image/png;base64,${chartBuffers.trend.toString('base64')}`;
        }
      } catch (e) {
        console.error('Preview chart error:', e);
      }
    }

    return {
      summary: {
        totalIncome: annualData.totalIncome,
        totalExpenses: annualData.totalExpenses,
        netSavings: annualData.netIncome,
        savingsRate: annualData.savingsRate,
        avgMonthlyIncome: annualData.summary?.averageMonthlyIncome,
        avgMonthlyExpense: annualData.summary?.averageMonthlyExpense
      },
      categoryBreakdown: (categoryData.expenseBreakdown || []).slice(0, 8),
      monthlyTrends: (annualData.monthlyTrends || []).slice(-6),
      charts,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    };
  }
}

module.exports = new ReportService();
