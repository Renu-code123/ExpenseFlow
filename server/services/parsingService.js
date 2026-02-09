/**
 * Advanced Parsing Service for Deep Receipt Intelligence
 * Extracts structured data including individual line items from OCR text
 */
class ParsingService {
    constructor() {
        // Common receipt line item patterns
        this.lineItemPatterns = [
            // Pattern: "Item Name    $12.99" or "Item Name    12.99"
            /^(.+?)\s{2,}[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s*$/,
            // Pattern: "1x Item Name $12.99" or "2 x Item Name 12.99"
            /^(\d+)\s*[xX×]\s*(.+?)\s{2,}[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s*$/,
            // Pattern: "Item Name x2 $12.99"
            /^(.+?)\s*[xX×]\s*(\d+)\s{2,}[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s*$/,
            // Pattern: "Item Name - $12.99"
            /^(.+?)\s*[-–—]\s*[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s*$/,
            // Pattern: "$12.99 Item Name"
            /^[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s{2,}(.+?)$/,
            // Pattern: "Item Name: $12.99"
            /^(.+?):\s*[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s*$/
        ];

        // Keywords to exclude from line items (these are usually totals/subtotals)
        this.excludeKeywords = [
            'total', 'subtotal', 'sub-total', 'sub total',
            'tax', 'vat', 'gst', 'cgst', 'sgst', 'igst',
            'discount', 'savings', 'change', 'cash', 'card',
            'payment', 'paid', 'due', 'balance', 'round',
            'tip', 'gratuity', 'service charge', 'delivery',
            'net', 'gross', 'amount', 'qty', 'price'
        ];

        // Category keyword mappings for itemization
        this.categoryMappings = {
            food: ['bread', 'milk', 'cheese', 'chicken', 'rice', 'vegetables', 'fruit', 'eggs', 'butter', 'yogurt', 
                   'coffee', 'tea', 'juice', 'soda', 'water', 'pizza', 'burger', 'sandwich', 'noodles', 'pasta',
                   'snack', 'chips', 'chocolate', 'candy', 'ice cream', 'cake', 'cookie', 'biscuit', 'cereal'],
            healthcare: ['medicine', 'tablet', 'syrup', 'capsule', 'cream', 'bandage', 'vitamin', 'painkiller',
                        'antibiotic', 'cough', 'cold', 'fever', 'prescription', 'pharmacy'],
            shopping: ['shirt', 'pants', 'dress', 'shoes', 'bag', 'watch', 'jewelry', 'electronics', 'phone',
                      'charger', 'cable', 'book', 'stationery', 'pen', 'notebook'],
            utilities: ['recharge', 'bill', 'electricity', 'water', 'gas', 'internet', 'phone'],
            transport: ['fuel', 'petrol', 'diesel', 'parking', 'toll', 'fare'],
            entertainment: ['movie', 'ticket', 'game', 'subscription', 'music']
        };
    }

    /**
     * Parse structured data from receipt text
     * @param {string} text - Raw text from OCR
     * @returns {Object} - Parsed data (amount, date, merchant, category)
     */
    parseReceiptText(text) {
        if (!text) return null;

        const data = {
            amount: this.extractAmount(text),
            date: this.extractDate(text),
            merchant: this.extractMerchant(text),
            category: 'other',
            confidence: 0
        };

        if (data.merchant) {
            data.category = this.suggestCategory(data.merchant, text);
        }

        // Calculate overall confidence based on found fields
        let foundFields = 0;
        if (data.amount) foundFields++;
        if (data.date) foundFields++;
        if (data.merchant) foundFields++;

        data.confidence = Math.round((foundFields / 3) * 100);

        return data;
    }

    /**
     * Extract individual line items from receipt text
     * @param {string} text - Raw OCR text
     * @returns {Array} - Array of line items with description, amount, quantity
     */
    extractLineItems(text) {
        if (!text) return [];

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        const items = [];

        for (const line of lines) {
            // Skip if line contains excluded keywords
            const lineLower = line.toLowerCase();
            if (this.excludeKeywords.some(kw => lineLower.includes(kw))) {
                continue;
            }

            // Try each pattern
            let matched = false;
            for (const pattern of this.lineItemPatterns) {
                const match = line.match(pattern);
                if (match) {
                    const item = this.parseItemMatch(match, pattern);
                    if (item && item.amount > 0 && item.amount < 100000) {
                        // Categorize the item
                        item.category = this.categorizeItem(item.description);
                        items.push(item);
                        matched = true;
                        break;
                    }
                }
            }

            // If no pattern matched, try heuristic parsing
            if (!matched) {
                const heuristicItem = this.heuristicItemParse(line);
                if (heuristicItem) {
                    heuristicItem.category = this.categorizeItem(heuristicItem.description);
                    items.push(heuristicItem);
                }
            }
        }

        // Remove duplicates and very small amounts (likely fees/taxes)
        const filtered = items.filter((item, index, self) => {
            const isDuplicate = self.findIndex(i => 
                i.description === item.description && i.amount === item.amount
            ) !== index;
            return !isDuplicate && item.amount >= 1;
        });

        return filtered;
    }

    /**
     * Parse matched item from regex
     */
    parseItemMatch(match, pattern) {
        const patternStr = pattern.toString();
        
        // Pattern with quantity at start: /^(\d+)\s*[xX×]\s*(.+?)\s{2,}[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s*$/
        if (patternStr.includes('(\\d+)\\s*[xX×]')) {
            return {
                description: match[2].trim(),
                quantity: parseInt(match[1]),
                amount: parseFloat(match[3].replace(',', '.')),
                unitPrice: parseFloat(match[3].replace(',', '.')) / parseInt(match[1])
            };
        }
        
        // Pattern with quantity at end: /^(.+?)\s*[xX×]\s*(\d+)\s{2,}[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s*$/
        if (patternStr.includes('[xX×]\\s*(\\d+)')) {
            return {
                description: match[1].trim(),
                quantity: parseInt(match[2]),
                amount: parseFloat(match[3].replace(',', '.')),
                unitPrice: parseFloat(match[3].replace(',', '.')) / parseInt(match[2])
            };
        }

        // Pattern with amount at start: /^[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s{2,}(.+?)$/
        if (patternStr.startsWith('/^[$')) {
            return {
                description: match[2].trim(),
                quantity: 1,
                amount: parseFloat(match[1].replace(',', '.')),
                unitPrice: parseFloat(match[1].replace(',', '.'))
            };
        }

        // Standard pattern: description then amount
        return {
            description: match[1].trim(),
            quantity: 1,
            amount: parseFloat(match[2].replace(',', '.')),
            unitPrice: parseFloat(match[2].replace(',', '.'))
        };
    }

    /**
     * Heuristic parsing for lines that don't match standard patterns
     */
    heuristicItemParse(line) {
        // Find all numbers in the line
        const numbers = line.match(/\d+(?:[.,]\d{2})?/g);
        if (!numbers || numbers.length === 0) return null;

        // Get the last number (usually the price)
        const amount = parseFloat(numbers[numbers.length - 1].replace(',', '.'));
        
        // Check if it's a reasonable item price
        if (amount <= 0 || amount > 50000) return null;

        // Extract description (everything before the amount)
        const amountIndex = line.lastIndexOf(numbers[numbers.length - 1]);
        let description = line.substring(0, amountIndex).trim();

        // Clean up description
        description = description.replace(/[$₹€£\-:]+$/, '').trim();
        
        // Must have meaningful description
        if (description.length < 2) return null;

        return {
            description: description,
            quantity: 1,
            amount: amount,
            unitPrice: amount
        };
    }

    /**
     * Categorize an item based on its description
     */
    categorizeItem(description) {
        if (!description) return 'other';
        
        const descLower = description.toLowerCase();
        
        for (const [category, keywords] of Object.entries(this.categoryMappings)) {
            if (keywords.some(kw => descLower.includes(kw))) {
                return category;
            }
        }
        
        return 'other';
    }

    /**
     * Extract total amount from text
     */
    extractAmount(text) {
        // Look for patterns like "Total: 50.00", "Amount: $10", etc.
        const patterns = [
            /(?:grand\s*total|total\s*amount|net\s*total|amount\s*due)[:\s]*[$₹€£]?\s*(\d+(?:[.,]\d{2})?)/i,
            /(?:total|amount|sum|net|balance|due|payable)[:\s]*[$₹€£]?\s*(\d+(?:[.,]\d{2})?)/i,
            /[$₹€£]?\s*(\d+(?:[.,]\d{2})?)\s*(?:total|amount|sum)/i,
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const amount = parseFloat(match[1].replace(',', '.'));
                if (amount > 0 && amount < 10000000) {
                    return amount;
                }
            }
        }

        // Fallback: look for the largest number that's likely a total
        const allNumbers = text.match(/\d+(?:[.,]\d{2})?/g);
        if (allNumbers && allNumbers.length > 0) {
            const values = allNumbers.map(n => parseFloat(n.replace(',', '.')))
                .filter(v => v > 0.5 && v < 1000000);
            
            if (values.length > 0) {
                // Return the maximum (totals are usually the largest)
                return Math.max(...values);
            }
        }

        return null;
    }

    /**
     * Extract date from text
     */
    extractDate(text) {
        const patterns = [
            /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/, // DD/MM/YYYY or MM/DD/YYYY
            /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}/i,
            /\d{4}[\-\/](\d{1,2})[\-\/](\d{1,2})/, // YYYY-MM-DD
            /(\d{1,2})[\s\-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-](\d{2,4})/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const parsedDate = new Date(match[0]);
                if (!isNaN(parsedDate.getTime())) {
                    // Sanity check: date shouldn't be too far in future
                    if (parsedDate <= new Date(Date.now() + 86400000)) {
                        return parsedDate;
                    }
                }
            }
        }
        return new Date(); // Default to today
    }

    /**
     * Extract merchant name (usually first few lines)
     */
    extractMerchant(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        if (lines.length === 0) return 'Unknown Store';

        // Skip common headers and look for merchant name
        const skipList = ['receipt', 'invoice', 'order', 'tax', 'bill', 'cash', 'memo', 'welcome', 'thank'];
        
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const line = lines[i].toLowerCase();
            // Skip lines with only numbers
            if (/^\d+$/.test(lines[i])) continue;
            // Skip very short lines
            if (lines[i].length < 3) continue;
            // Skip lines that are just dates or amounts
            if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(lines[i])) continue;
            if (/^[$₹€£]?\s*\d+(?:[.,]\d{2})?$/.test(lines[i])) continue;
            
            if (!skipList.some(skip => line.includes(skip))) {
                // Clean up the merchant name
                let merchant = lines[i]
                    .replace(/[^\w\s&'-]/g, '')
                    .trim();
                
                if (merchant.length >= 3) {
                    return merchant;
                }
            }
        }
        
        return lines[0] ? lines[0].substring(0, 30) : 'Unknown Store';
    }

    /**
     * Suggest category based on merchant and keywords
     */
    suggestCategory(merchant, text) {
        const lowerMerchant = (merchant || '').toLowerCase();
        const lowerText = (text || '').toLowerCase();

        const mappings = {
            food: ['restaurant', 'cafe', 'mcdonald', 'starbucks', 'pizza', 'burger', 'food', 'eats', 'grill', 
                   'bakery', 'swiggy', 'zomato', 'doordash', 'domino', 'kfc', 'subway', 'grocery', 'supermarket',
                   'market', 'fresh', 'deli', 'bistro', 'kitchen', 'diner', 'eatery'],
            transport: ['uber', 'ola', 'taxi', 'fuel', 'petrol', 'parking', 'metro', 'train', 'flight', 
                       'airline', 'irctc', 'shell', 'bp', 'gas station', 'toll', 'lyft', 'grab'],
            shopping: ['amazon', 'walmart', 'target', 'flipkart', 'myntra', 'nike', 'adidas', 'clothing', 
                      'fashion', 'mall', 'mart', 'store', 'shop', 'retail', 'outlet', 'costco', 'bestbuy'],
            entertainment: ['netflix', 'spotify', 'cinema', 'theatre', 'movie', 'game', 'club', 'pvr', 'inox',
                           'disney', 'hbo', 'prime video', 'concert', 'ticket', 'arcade'],
            utilities: ['electric', 'water', 'gas', 'internet', 'mobile', 'recharge', 'bill', 'insurance',
                       'telecom', 'vodafone', 'airtel', 'jio', 'att', 'verizon'],
            healthcare: ['pharmacy', 'hospital', 'doctor', 'clinic', 'medical', 'medicine', 'lab', 'health',
                        'cvs', 'walgreens', 'apollo', 'fortis', 'dental', 'optician', 'diagnostic']
        };

        for (const [cat, keywords] of Object.entries(mappings)) {
            if (keywords.some(kw => lowerMerchant.includes(kw) || lowerText.includes(kw))) {
                return cat;
            }
        }

        return 'other';
    }

    /**
     * Generate a summary from line items
     */
    generateItemsSummary(items) {
        if (!items || items.length === 0) return null;

        const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        const categories = {};

        items.forEach(item => {
            const cat = item.category || 'other';
            if (!categories[cat]) {
                categories[cat] = { count: 0, total: 0 };
            }
            categories[cat].count++;
            categories[cat].total += item.amount || 0;
        });

        return {
            itemCount: items.length,
            total: total,
            categoriesBreakdown: categories,
            items: items.map(i => ({
                description: i.description,
                amount: i.amount,
                category: i.category
            }))
        };
    }
}

module.exports = new ParsingService();
