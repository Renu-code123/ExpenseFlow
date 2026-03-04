// Receipt OCR Service

class ReceiptOCR {
    async scan(imageData) {
        // OCR processing
        return { merchant: '', amount: 0, date: null };
    }
    
    extractAmount(text) {
        // Extract amount from text
    }
}

module.exports = new ReceiptOCR();

