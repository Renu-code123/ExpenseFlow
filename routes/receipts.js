const express = require('express');
const auth = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/uploadMiddleware');
const fileUploadService = require('../services/fileUploadService');
const ocrService = require('../services/ocrService');
const parsingService = require('../services/parsingService');
const Receipt = require('../models/Receipt');
const Expense = require('../models/Expense');
const router = express.Router();

/**
 * @route   POST /api/receipts/scan
 * @desc    Upload receipt and extract data using AI OCR with itemization
 * @access  Private
 */
router.post('/scan', auth, upload, handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No receipt image uploaded' });
    }

    // 1. Process OCR with deep parsing
    const extractedData = await ocrService.processReceipt(req.file.buffer);

    if (!extractedData.success) {
      return res.status(400).json({
        error: 'Failed to process receipt',
        message: extractedData.message
      });
    }

    // 2. Upload to Cloudinary for preview
    const filename = `scan_temp_${req.user._id}_${Date.now()}`;
    const uploadResult = await fileUploadService.uploadToCloudinary(
      req.file.buffer,
      filename,
      `temp_scans/${req.user._id}`
    );

    res.json({
      success: true,
      data: {
        merchant: extractedData.merchant,
        amount: extractedData.amount,
        date: extractedData.date,
        category: extractedData.category,
        confidence: extractedData.confidence,
        rawText: extractedData.rawText,
        items: extractedData.items || [],
        itemCount: extractedData.itemCount || 0,
        itemsTotal: extractedData.itemsTotal || 0,
        hasMultipleItems: extractedData.hasMultipleItems || false,
        totalMatch: extractedData.totalMatch || false,
        fileUrl: uploadResult.secure_url,
        cloudinaryId: uploadResult.public_id,
        originalName: req.file.originalname
      }
    });

  } catch (error) {
    console.error('[Receipt Scan] Error:', error);
    res.status(500).json({ error: 'Failed to scan receipt: ' + error.message });
  }
});

/**
 * @route   POST /api/receipts/scan-deep
 * @desc    Deep scan receipt and return detailed itemization
 * @access  Private
 */
router.post('/scan-deep', auth, upload, handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No receipt image uploaded' });
    }

    // Full receipt extraction with expense suggestions
    const result = await ocrService.extractReceiptData(req.file.buffer);

    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to process receipt',
        message: result.message
      });
    }

    // Upload to Cloudinary
    const filename = `scan_deep_${req.user._id}_${Date.now()}`;
    const uploadResult = await fileUploadService.uploadToCloudinary(
      req.file.buffer,
      filename,
      `receipts/${req.user._id}`
    );

    res.json({
      success: true,
      data: {
        ...result.data,
        fileUrl: uploadResult.secure_url,
        cloudinaryId: uploadResult.public_id,
        originalName: req.file.originalname
      }
    });

  } catch (error) {
    console.error('[Deep Scan] Error:', error);
    res.status(500).json({ error: 'Failed to deep scan receipt: ' + error.message });
  }
});

/**
 * @route   POST /api/receipts/save-scanned
 * @desc    Confirm scanned data and create expense + receipt record
 * @access  Private
 */
router.post('/save-scanned', auth, async (req, res) => {
  try {
    const {
      description,
      amount,
      category,
      date,
      merchant,
      fileUrl,
      cloudinaryId,
      originalName,
      type = 'expense',
      folderId = null
    } = req.body;

    // 1. Create Expense
    const expense = new Expense({
      user: req.user._id,
      description: description || merchant || 'Receipt Expense',
      amount,
      category,
      type,
      merchant: merchant || '',
      date: date || new Date(),
      originalAmount: amount,
      originalCurrency: 'INR',
      source: 'receipt_scan'
    });

    await expense.save();

    // 2. Create Receipt reference
    const receipt = new Receipt({
      user: req.user._id,
      expense: expense._id,
      filename: cloudinaryId.split('/').pop(),
      originalName,
      fileUrl,
      cloudinaryId,
      fileType: 'image',
      fileSize: 0,
      folder: folderId,
      ocrData: {
        extractedText: 'Stored from scan flow',
        extractedAmount: amount,
        extractedDate: date,
        confidence: 100
      }
    });

    await receipt.save();

    res.status(201).json({
      success: true,
      message: 'Expense created from receipt successfully',
      data: { expense, receipt }
    });

  } catch (error) {
    console.error('[Save Scanned] Error:', error);
    res.status(500).json({ error: 'Failed to save scanned expense' });
  }
});

/**
 * @route   POST /api/receipts/save-itemized
 * @desc    Save multiple expense items from one receipt (auto-split)
 * @access  Private
 */
router.post('/save-itemized', auth, async (req, res) => {
  try {
    const {
      items,
      merchant,
      date,
      fileUrl,
      cloudinaryId,
      originalName,
      rawText
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const createdExpenses = [];
    const expenseIds = [];

    // Create expense for each item
    for (const item of items) {
      if (!item.amount || item.amount <= 0) continue;

      const expense = new Expense({
        user: req.user._id,
        description: item.description || `Item from ${merchant}`,
        amount: item.amount,
        category: item.category || 'other',
        type: 'expense',
        merchant: merchant || '',
        date: date || new Date(),
        originalAmount: item.amount,
        originalCurrency: 'INR',
        source: 'receipt_itemized'
      });

      await expense.save();
      createdExpenses.push(expense);
      expenseIds.push(expense._id);
    }

    // Create single receipt linked to first expense (or all via metadata)
    const receipt = new Receipt({
      user: req.user._id,
      expense: expenseIds[0], // Primary expense
      filename: cloudinaryId ? cloudinaryId.split('/').pop() : `receipt_${Date.now()}`,
      originalName: originalName || 'Itemized Receipt',
      fileUrl: fileUrl || '',
      cloudinaryId: cloudinaryId || '',
      fileType: 'image',
      fileSize: 0,
      ocrData: {
        extractedText: rawText || '',
        itemizedExpenses: expenseIds,
        itemCount: createdExpenses.length,
        totalAmount: createdExpenses.reduce((sum, e) => sum + e.amount, 0),
        confidence: 85
      }
    });

    await receipt.save();

    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user._id}`).emit('expenses_created', {
        count: createdExpenses.length,
        expenses: createdExpenses
      });
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdExpenses.length} expenses from receipt`,
      data: {
        expenses: createdExpenses,
        receipt,
        totalAmount: createdExpenses.reduce((sum, e) => sum + e.amount, 0)
      }
    });

  } catch (error) {
    console.error('[Save Itemized] Error:', error);
    res.status(500).json({ error: 'Failed to save itemized expenses' });
  }
});

// Upload receipt for expense
router.post('/upload/:expenseId', auth, upload, handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify expense belongs to user
    const expense = await Expense.findOne({ _id: req.params.expenseId, user: req.user._id });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    let processedBuffer = req.file.buffer;
    const fileType = fileUploadService.getFileType(req.file.mimetype);

    // Compress image if it's an image file
    if (fileType === 'image') {
      processedBuffer = await fileUploadService.compressImage(req.file.buffer);
    }

    // Generate unique filename
    const filename = `receipt_${req.params.expenseId}_${Date.now()}`;

    // Upload to Cloudinary
    const uploadResult = await fileUploadService.uploadToCloudinary(
      processedBuffer,
      filename,
      `receipts/${req.user._id}`
    );

    // Create receipt record
    const receipt = new Receipt({
      user: req.user._id,
      expense: req.params.expenseId,
      filename: filename,
      originalName: req.file.originalname,
      fileUrl: uploadResult.secure_url,
      cloudinaryId: uploadResult.public_id,
      fileType: fileType,
      fileSize: processedBuffer.length
    });

    // Perform OCR for images
    if (fileType === 'image') {
      try {
        const ocrData = await fileUploadService.extractTextFromImage(uploadResult.secure_url);
        receipt.ocrData = ocrData;
      } catch (ocrError) {
        console.error('OCR processing failed:', ocrError);
      }
    }

    await receipt.save();

    res.status(201).json({
      message: 'Receipt uploaded successfully',
      receipt: {
        id: receipt._id,
        filename: receipt.filename,
        fileUrl: receipt.fileUrl,
        fileType: receipt.fileType,
        ocrData: receipt.ocrData
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get receipts for expense
router.get('/expense/:expenseId', auth, async (req, res) => {
  try {
    const expense = await Expense.findOne({ _id: req.params.expenseId, user: req.user._id });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const receipts = await Receipt.find({
      expense: req.params.expenseId,
      user: req.user._id
    }).select('-cloudinaryId');

    res.json(receipts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all receipts for user (with optional folder filter)
router.get('/', auth, async (req, res) => {
  try {
    const query = { user: req.user._id };
    if (req.query.folderId) {
      // If folderId is 'null' string or explicitly null, filter for unfiled
      if (req.query.folderId === 'null') {
        query.folder = null;
      } else {
        query.folder = req.query.folderId;
      }
    }

    const receipts = await Receipt.find(query)
      .populate('expense', 'description amount category type date')
      .populate('folder', 'name color')
      .select('-cloudinaryId')
      .sort({ createdAt: -1 });

    res.json(receipts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete receipt
router.delete('/:receiptId', auth, async (req, res) => {
  try {
    const receipt = await Receipt.findOne({
      _id: req.params.receiptId,
      user: req.user._id
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Delete from Cloudinary
    await fileUploadService.deleteFromCloudinary(receipt.cloudinaryId);

    // Delete from database
    await Receipt.findByIdAndDelete(req.params.receiptId);

    res.json({ message: 'Receipt deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get OCR data for receipt
router.get('/:receiptId/ocr', auth, async (req, res) => {
  try {
    const receipt = await Receipt.findOne({
      _id: req.params.receiptId,
      user: req.user._id
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    if (!receipt.ocrData) {
      return res.status(404).json({ error: 'No OCR data available' });
    }

    res.json(receipt.ocrData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PUT /api/receipts/:id/move
 * @desc    Move receipt to a folder
 * @access  Private
 */
router.put('/:id/move', auth, async (req, res) => {
  try {
    const { folderId } = req.body;

    // Validate folder ownership if folderId is provided
    if (folderId) {
      const DocumentFolder = require('../models/DocumentFolder');
      const folder = await DocumentFolder.findOne({ _id: folderId, user: req.user._id });
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
    }

    const receipt = await Receipt.findOne({ _id: req.params.id, user: req.user._id });
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    receipt.folder = folderId || null;
    await receipt.save();

    res.json(receipt);
  } catch (error) {
    console.error('Error moving receipt:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
