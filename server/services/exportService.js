const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

class ExportService {

  /**
   * Generate export based on format
   */
  async generateExport(data, format, options = {}) {
    if (format === 'pdf') {
      return this.exportToPDF(data, options);
    } else if (format === 'excel' || format === 'xlsx') {
      return this.exportToExcel(data, options);
    } else {
      return this.exportToCSV(data, options.filename);
    }
  }

  /**
   * Generate CSV Export
   */
  exportToCSV(data, filename = 'expenses.csv') {
    if (!data || data.length === 0) {
      return { success: false, message: 'No data to export' };
    }

    // Flatten object for CSV if needed, handled simply here
    const headers = ['Date', 'Description', 'Category', 'Amount', 'Currency', 'Type', 'Payment Method'];

    const csvContent = [
      headers.join(','),
      ...data.map(item => {
        const row = [
          new Date(item.date).toISOString().split('T')[0],
          `"${(item.description || '').replace(/"/g, '""')}"`,
          item.category || 'Uncategorized',
          item.amount,
          item.currency || 'INR',
          item.type,
          item.paymentMethod || 'Cash'
        ];
        return row.join(',');
      })
    ].join('\n');

    return csvContent;
  }

  /**
   * Generate JSON Export
   */
  exportToJSON(data, filename = 'expenses.json') {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Generate PDF Report with Charts and Tables
   */
  async exportToPDF(data, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        console.log('PDF: Starting generation...');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });

        // Report Statistics
        const stats = this.calculateStats(data);
        const { currency = 'INR', title = 'Expense Report' } = options;

        // --- Header ---
        doc.fillColor('#444444')
          .fontSize(20)
          .text(title, { align: 'center' })
          .fontSize(10)
          .text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });

        doc.moveDown();

        // --- Summary Section ---
        doc.fillColor('#000000').fontSize(14).text('Summary', { underline: true });
        doc.moveDown(0.5);

        const summaryY = doc.y;

        // Income
        doc.fontSize(12).fillColor('#2ecc71')
          .text(`Total Income: ${currency} ${stats.summary.totalIncome.toFixed(2)}`, 50, summaryY);

        // Expenses
        doc.fillColor('#e74c3c')
          .text(`Total Expenses: ${currency} ${stats.summary.totalExpense.toFixed(2)}`, 200, summaryY);

        // Net
        const netColor = stats.summary.netBalance >= 0 ? '#2ecc71' : '#e74c3c';
        doc.fillColor(netColor)
          .text(`Net Balance: ${currency} ${stats.summary.netBalance.toFixed(2)}`, 400, summaryY);

        doc.moveDown(2);

        // --- Category Breakdown (Top 5) ---
        if (stats.categoryBreakdown.length > 0) {
          doc.fillColor('#000000').fontSize(14).text('Top Categories', { underline: true });
          doc.moveDown(0.5);

          stats.categoryBreakdown.slice(0, 5).forEach((cat, index) => {
            doc.fontSize(10).fillColor('#555555')
              .text(`${index + 1}. ${cat.category}: ${currency} ${cat.total.toFixed(2)} (${cat.percentage.toFixed(1)}%)`);
          });
          doc.moveDown(2);
        }

        // --- Transactions Table ---
        doc.fillColor('#000000').fontSize(14).text('Recent Transactions', { underline: true });
        doc.moveDown(0.5);

        // Table Headers
        const tableTop = doc.y;
        const dateX = 50;
        const descX = 130;
        const catX = 300;
        const amountX = 450;

        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', dateX, tableTop);
        doc.text('Description', descX, tableTop);
        doc.text('Category', catX, tableTop);
        doc.text('Amount', amountX, tableTop);

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        let y = tableTop + 25;
        doc.font('Helvetica').fontSize(9);

        // Limit transactions for PDF to avoid huge files, or paginate (simplified here)
        const transactionsToPrint = data.slice(0, 100);

        transactionsToPrint.forEach(item => {
          if (y > 700) { // Add new page
            doc.addPage();
            y = 50;
          }

          const amountColor = item.type === 'income' ? '#2ecc71' : '#e74c3c';
          const sign = item.type === 'income' ? '+' : '-';

          doc.fillColor('#000000').text(new Date(item.date).toISOString().split('T')[0], dateX, y);
          doc.text(
            item.description ? item.description.substring(0, 30) + (item.description.length > 30 ? '...' : '') : '-',
            descX, y
          );
          doc.text(item.category || '-', catX, y);
          doc.fillColor(amountColor).text(`${sign}${item.amount.toFixed(2)}`, amountX, y);

          y += 15;
          doc.moveTo(50, y - 5).lineTo(550, y - 5).strokeColor('#eeeeee').stroke();
        });

        doc.end();

      } catch (error) {
        console.error('PDF Generation Crash:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate Excel Report
   */
  async exportToExcel(data, options = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ExpenseFlow';
    workbook.created = new Date();

    const stats = this.calculateStats(data);
    const { currency = 'INR' } = options;

    // --- Sheet 1: Summary ---
    const summarySheet = workbook.addWorksheet('Summary');

    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 20 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    summarySheet.addRows([
      { metric: 'Total Income', value: stats.summary.totalIncome },
      { metric: 'Total Expenses', value: stats.summary.totalExpense },
      { metric: 'Net Balance', value: stats.summary.netBalance },
      { metric: 'Transaction Count', value: data.length }
    ]);

    // Add category breakdown to summary
    summarySheet.addRow({});
    summarySheet.addRow({ metric: 'Category Breakdown', value: '' }).font = { bold: true };

    stats.categoryBreakdown.forEach(cat => {
      summarySheet.addRow({ metric: cat.category, value: cat.total });
    });

    // Styling Summary
    summarySheet.getRow(1).font = { bold: true };

    // --- Sheet 2: Transactions ---
    const transSheet = workbook.addWorksheet('Transactions');

    transSheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Method', key: 'method', width: 15 }
    ];

    data.forEach(item => {
      transSheet.addRow({
        date: new Date(item.date),
        type: item.type,
        category: item.category,
        description: item.description,
        amount: item.amount,
        currency: item.currency || currency,
        method: item.paymentMethod
      });
    });

    // Style Header
    transSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    transSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  /**
   * Generate Preview Data (aggregation for frontend)
   */
  async generatePreview(data) {
    return this.calculateStats(data);
  }

  /**
   * Helper: Calculate statistics from data
   */
  calculateStats(data) {
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = {};
    const monthlyTotals = {};

    data.forEach(item => {
      const amount = Number(item.amount) || 0;

      // Income vs Expense
      if (item.type === 'income') {
        totalIncome += amount;
      } else {
        totalExpense += amount;

        // Category Logic (only for expenses usually)
        const cat = item.category || 'Uncategorized';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
      }

      // Monthly Trend
      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyTotals[monthKey]) monthlyTotals[monthKey] = { income: 0, expense: 0 };
      if (item.type === 'income') monthlyTotals[monthKey].income += amount;
      else monthlyTotals[monthKey].expense += amount;
    });

    // Format Category Breakdown
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, total]) => ({
        category,
        total,
        percentage: totalExpense > 0 ? (total / totalExpense) * 100 : 0
      }))
      .sort((a, b) => b.total - a.total);

    // Format Monthly Trends
    const trends = Object.entries(monthlyTotals)
      .map(([month, totals]) => ({
        month,
        income: totals.income,
        expense: totals.expense
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const dateRange = {
      start: data.length > 0 ? new Date(Math.min(...data.map(d => new Date(d.date)))).toISOString().split('T')[0] : null,
      end: data.length > 0 ? new Date(Math.max(...data.map(d => new Date(d.date)))).toISOString().split('T')[0] : null
    };

    return {
      summary: {
        totalIncome,
        totalExpense,
        netBalance: totalIncome - totalExpense
      },
      categoryBreakdown,
      monthlyTrends: trends,
      transactionCount: data.length,
      dateRange
    };
  }
}

module.exports = new ExportService();