const Tesseract = require('tesseract.js');
const parsingService = require('./parsingService');

/**
 * Advanced OCR Service with Deep Receipt Intelligence
 * Uses Tesseract.js for text extraction and advanced parsing for itemization
 */
class OCRService {
    constructor() {
        this.worker = null;
        this.isInitialized = false;
    }

    /**
     * Initialize Tesseract worker
     */
    async initializeWorker() {
        if (this.isInitialized && this.worker) {
            return this.worker;
        }

        try {
            this.worker = await Tesseract.createWorker('eng', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`[OCR] Progress: ${(m.progress * 100).toFixed(1)}%`);
                    }
                }
            });

            this.isInitialized = true;
            console.log('[OCR] Tesseract worker initialized');
            return this.worker;
        } catch (error) {
            console.error('[OCR] Failed to initialize Tesseract:', error);
            throw error;
        }
    }

    /**
     * Extract raw text from image buffer
     * @param {Buffer} imageBuffer - Image file buffer
     * @returns {Object} - OCR result with text and confidence
     */
    async extractText(imageBuffer) {
        try {
            const worker = await this.initializeWorker();

            const { data } = await worker.recognize(imageBuffer);

            return {
                success: true,
                text: data.text,
                confidence: data.confidence,
                words: data.words || [],
                lines: data.lines || [],
                paragraphs: data.paragraphs || []
            };
        } catch (error) {
            console.error('[OCR] Text extraction error:', error);
            return {
                success: false,
                message: error.message,
                text: '',
                confidence: 0
            };
        }
    }

    /**
     * Process receipt image and extract structured data with line items
     * @param {Buffer} imageBuffer - Image file buffer
     * @returns {Object} - Extracted receipt data with items
     */
    async processReceipt(imageBuffer) {
        try {
            // Step 1: Extract raw text
            const ocrResult = await this.extractText(imageBuffer);

            if (!ocrResult.success || !ocrResult.text) {
                return {
                    success: false,
                    message: 'Failed to extract text from image',
                    rawText: '',
                    confidence: 0
                };
            }

            console.log('[OCR] Raw text extracted, parsing receipt...');

            // Step 2: Parse receipt structure (basic info)
            const basicData = parsingService.parseReceiptText(ocrResult.text);

            // Step 3: Deep parse for line items
            const lineItems = parsingService.extractLineItems(ocrResult.text);

            // Step 4: Calculate totals and verify
            const itemsTotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
            const extractedTotal = basicData?.amount || 0;

            // If items total is close to extracted total, we have good confidence
            const totalMatch = Math.abs(itemsTotal - extractedTotal) < (extractedTotal * 0.1);

            return {
                success: true,
                rawText: ocrResult.text,
                confidence: ocrResult.confidence,
                merchant: basicData?.merchant || 'Unknown Merchant',
                date: basicData?.date || new Date(),
                category: basicData?.category || 'other',
                amount: extractedTotal || itemsTotal,
                items: lineItems,
                itemsTotal: itemsTotal,
                totalMatch: totalMatch,
                itemCount: lineItems.length,
                hasMultipleItems: lineItems.length > 1
            };
        } catch (error) {
            console.error('[OCR] Receipt processing error:', error);
            return {
                success: false,
                message: error.message,
                rawText: '',
                confidence: 0,
                items: []
            };
        }
    }

    /**
     * Extract receipt data with auto-split capability
     * @param {Buffer} imageBuffer - Image file buffer
     * @returns {Object} - Full receipt analysis with split expenses
     */
    async extractReceiptData(imageBuffer) {
        const result = await this.processReceipt(imageBuffer);

        if (!result.success) {
            return result;
        }

        // Prepare expenses for auto-split
        const expenses = [];

        if (result.hasMultipleItems && result.items.length > 0) {
            // Create individual expense entries for each line item
            result.items.forEach((item, index) => {
                if (item.amount && item.amount > 0) {
                    expenses.push({
                        description: item.description || `Item ${index + 1}`,
                        amount: item.amount,
                        quantity: item.quantity || 1,
                        unitPrice: item.unitPrice || item.amount,
                        category: item.category || result.category,
                        merchant: result.merchant,
                        date: result.date,
                        isFromReceipt: true,
                        receiptItemIndex: index
                    });
                }
            });
        } else {
            // Single expense from total
            expenses.push({
                description: `Receipt from ${result.merchant}`,
                amount: result.amount,
                category: result.category,
                merchant: result.merchant,
                date: result.date,
                isFromReceipt: true,
                receiptItemIndex: 0
            });
        }

        return {
            success: true,
            data: {
                merchant: result.merchant,
                amount: result.amount,
                date: result.date,
                category: result.category,
                rawText: result.rawText,
                confidence: result.confidence,
                items: result.items,
                expenses: expenses,
                hasMultipleItems: result.hasMultipleItems,
                itemsTotal: result.itemsTotal,
                totalMatch: result.totalMatch
            }
        };
    }

    /**
     * Clean up worker when done
     */
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
            console.log('[OCR] Tesseract worker terminated');
        }
    }
}

module.exports = new OCRService();