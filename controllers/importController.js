const Transaction = require('../models/Transaction');
const User = require('../models/User');
const xlsx = require('exceljs');
const Joi = require('joi');
const { Readable } = require('stream');

const transactionSchema = Joi.object({
    description: Joi.string().trim().max(100).required(),
    amount: Joi.number().min(0.01).required(),
    currency: Joi.string().uppercase().length(3).optional(),
    category: Joi.string().valid('food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other', 'salary', 'freelance', 'investment', 'transfer').required(),
    type: Joi.string().valid('income', 'expense', 'transfer').required(),
    merchant: Joi.string().trim().max(50).optional(),
    date: Joi.date().optional()
});

exports.importTransactions = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // req.file.buffer contains the data because middleware uses memoryStorage
    const fileExtension = req.file.originalname.split('.').pop().toLowerCase();
    let transactions = [];
    let errors = [];
    let importedCount = 0;
    let skippedCount = 0;

    try {
        // Parse File
        if (fileExtension === 'json') {
            try {
                const jsonString = req.file.buffer.toString('utf8');
                transactions = JSON.parse(jsonString);
            } catch (e) {
                return res.status(400).json({ error: 'Invalid JSON format' });
            }
        } else if (fileExtension === 'csv') {
            const workbook = new xlsx.Workbook();
            const stream = Readable.from(req.file.buffer);
            await workbook.csv.read(stream);

            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) {
                return res.status(400).json({ error: 'Invalid CSV file' });
            }

            // Assuming first row is header
            const headers = [];
            worksheet.getRow(1).eachCell((cell, colNumber) => {
                headers[colNumber] = cell.value ? cell.value.toString().toLowerCase().trim() : '';
            });

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header
                const transaction = {};
                row.eachCell((cell, colNumber) => {
                    const header = headers[colNumber];
                    if (header) {
                        // cell.value can be an object in exceljs if it's a formula or rich text, but for CSV usually simple
                        transaction[header] = (cell.value && typeof cell.value === 'object' && cell.value.result) ? cell.value.result : cell.value;
                    }
                });
                if (Object.keys(transaction).length > 0) {
                    transactions.push(transaction);
                }
            });
        } else {
            return res.status(400).json({ error: 'Unsupported file format. Please upload CSV or JSON.' });
        }

        // Process Transactions
        const user = await User.findById(req.user._id);

        for (const rawData of transactions) {
            let amount = rawData.amount;
            // Handle "1,000.00" string amounts
            if (typeof amount === 'string') {
                amount = parseFloat(amount.replace(/,/g, ''));
            }

            let date = rawData.date ? new Date(rawData.date) : new Date();

            const transactionData = {
                description: rawData.description || 'Imported Transaction',
                amount: amount,
                currency: rawData.currency || user.preferredCurrency || 'INR',
                category: rawData.category ? rawData.category.toLowerCase() : 'other',
                type: rawData.type ? rawData.type.toLowerCase() : 'expense',
                merchant: rawData.merchant || '',
                date: date
            };

            // Validate
            const { error, value } = transactionSchema.validate(transactionData);
            if (error) {
                errors.push({
                    transaction: rawData,
                    error: error.details[0].message
                });
                continue;
            }

            // Check Duplicate
            const startWindow = new Date(value.date);
            startWindow.setSeconds(startWindow.getSeconds() - 60);
            const endWindow = new Date(value.date);
            endWindow.setSeconds(endWindow.getSeconds() + 60);

            const existing = await Transaction.findOne({
                user: req.user._id,
                amount: value.amount,
                description: value.description,
                type: value.type,
                date: { $gte: startWindow, $lte: endWindow }
            });

            if (existing) {
                skippedCount++;
                continue;
            }

            // Create Transaction
            await Transaction.create({
                ...value,
                user: req.user._id,
                originalAmount: value.amount,
                originalCurrency: value.currency,
                kind: value.type
            });
            importedCount++;
        }

        res.json({
            success: true,
            imported: importedCount,
            skipped: skippedCount,
            errors: errors.length > 0 ? errors : undefined,
            message: `Successfully imported ${importedCount} transactions. ${skippedCount} skipped as duplicates.`
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Failed to process import file: ' + error.message });
    }
};
