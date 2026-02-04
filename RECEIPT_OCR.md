# Smart Receipt OCR & Document Management System

An intelligent receipt scanning and document management system with OCR (Optical Character Recognition) to automatically extract expense data from receipts and store documents securely.

## Features

- 📷 **Smart OCR**: Automatic data extraction from receipt images using Tesseract.js or Google Cloud Vision
- 🔍 **Intelligent Parsing**: Extract merchant name, amount, date, line items, tax, and payment method
- 📁 **Document Management**: Organize receipts in folders with tags and full-text search
- 🔄 **Duplicate Detection**: Perceptual image hashing to identify duplicate receipts
- ✅ **Expense Creation**: Confirm and automatically create expenses from scanned receipts
- ✏️ **Manual Correction**: Edit OCR results with correction history tracking
- 📊 **Confidence Scores**: AI-powered confidence scoring for extracted data
- 🔐 **Secure Storage**: Cloud-based storage with Cloudinary integration

## Installation

### Dependencies

```bash
npm install tesseract.js @google-cloud/vision
```

### Optional: Google Cloud Vision Setup

For enhanced OCR accuracy, configure Google Cloud Vision:

1. Create a Google Cloud project
2. Enable Cloud Vision API
3. Download service account credentials
4. Set environment variable:

```bash
GOOGLE_CLOUD_VISION_CREDENTIALS=path/to/credentials.json
```

If not configured, the system will fall back to Tesseract.js.

## Models

### ReceiptDocument Model

Stores receipt images and extracted data:

```javascript
{
  user: ObjectId,
  original_image: {
    url: String,
    public_id: String,
    format: String,
    size: Number
  },
  thumbnail: {
    url: String,
    public_id: String
  },
  processed_text: String,
  extracted_data: {
    merchant_name: String,
    merchant_address: String,
    merchant_phone: String,
    total_amount: Number,
    subtotal: Number,
    tax_amount: Number,
    tip_amount: Number,
    discount_amount: Number,
    currency: String,
    date: Date,
    time: String,
    payment_method: String,
    card_last_four: String,
    transaction_id: String,
    invoice_number: String,
    category: String,
    line_items: [
      {
        description: String,
        quantity: Number,
        unit_price: Number,
        total_price: Number
      }
    ]
  },
  confidence_scores: {
    overall: Number,
    merchant: Number,
    amount: Number,
    date: Number
  },
  status: String, // pending, processing, completed, failed, confirmed
  image_hash: String,
  is_duplicate: Boolean,
  duplicate_of: ObjectId,
  expense_created: Boolean,
  expense_id: ObjectId,
  folder: ObjectId,
  tags: [String],
  manually_corrected: Boolean,
  correction_history: [...]
}
```

### DocumentFolder Model

Hierarchical folder structure for organizing documents:

```javascript
{
  user: ObjectId,
  name: String,
  description: String,
  color: String,
  icon: String,
  parent_folder: ObjectId,
  path: String,
  is_system: Boolean,
  metadata: {
    document_count: Number,
    total_size: Number,
    last_updated: Date
  }
}
```

## API Documentation

### Upload & Process Receipt

#### Upload Receipt Image
```http
POST /api/receipts/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": <receipt-image>,
  "folder": "64a1b2c3d4e5f6789abcdef0"  // Optional
}
```

**Supported Formats:** JPG, PNG, PDF (first page)  
**Max Size:** 10MB

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "status": "processing",
    "original_image": {
      "url": "https://res.cloudinary.com/...",
      "public_id": "receipts/...",
      "size": 245678
    },
    "message": "Receipt uploaded successfully. Processing..."
  }
}
```

The receipt will be automatically processed by OCR in the background.

### Retrieve Receipts

#### Get All Receipts
```http
GET /api/receipts
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: pending | processing | completed | failed | confirmed
- `start_date`: Filter by date range start
- `end_date`: Filter by date range end
- `merchant`: Filter by merchant name (partial match)
- `min_amount`: Minimum amount
- `max_amount`: Maximum amount
- `category`: Filter by category
- `tags`: Comma-separated tags
- `folder`: Folder ID
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "original_image": {
        "url": "https://res.cloudinary.com/..."
      },
      "extracted_data": {
        "merchant_name": "Starbucks",
        "total_amount": 450,
        "currency": "INR",
        "date": "2024-01-15T00:00:00.000Z",
        "category": "food"
      },
      "confidence_scores": {
        "overall": 92,
        "merchant": 95,
        "amount": 98,
        "date": 85
      },
      "confidence_level": "high",
      "status": "completed",
      "expense_created": false,
      "tags": ["coffee", "personal"],
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

#### Get Receipt Details
```http
GET /api/receipts/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "original_image": {
      "url": "https://res.cloudinary.com/...",
      "format": "jpg",
      "size": 245678
    },
    "thumbnail": {
      "url": "https://res.cloudinary.com/..."
    },
    "processed_text": "Full OCR text output...",
    "extracted_data": {
      "merchant_name": "Starbucks Coffee",
      "merchant_address": "123 Main St, City",
      "merchant_phone": "+91-1234567890",
      "total_amount": 450,
      "subtotal": 400,
      "tax_amount": 50,
      "currency": "INR",
      "date": "2024-01-15T00:00:00.000Z",
      "time": "10:30 AM",
      "payment_method": "credit_card",
      "card_last_four": "4567",
      "transaction_id": "TXN123456789",
      "category": "food",
      "line_items": [
        {
          "description": "Caffe Latte",
          "quantity": 2,
          "unit_price": 200,
          "total_price": 400
        }
      ]
    },
    "confidence_scores": {
      "overall": 92,
      "merchant": 95,
      "amount": 98,
      "date": 85
    },
    "confidence_level": "high",
    "status": "completed",
    "is_duplicate": false,
    "manually_corrected": false,
    "tags": ["coffee", "personal"],
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Confirm & Create Expense

#### Confirm Receipt and Create Expense
```http
POST /api/receipts/:id/confirm
Authorization: Bearer <token>
Content-Type: application/json

{
  "notes": "Team lunch meeting"
}
```

Creates an expense from the receipt data and marks the receipt as confirmed.

**Response:**
```json
{
  "success": true,
  "data": {
    "receipt": {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "status": "confirmed",
      "expense_created": true,
      "expense_id": "64a1b2c3d4e5f6789abcdef1"
    },
    "expense": {
      "_id": "64a1b2c3d4e5f6789abcdef1",
      "description": "Starbucks Coffee",
      "amount": 450,
      "category": "food",
      "date": "2024-01-15T00:00:00.000Z"
    }
  },
  "message": "Expense created successfully from receipt"
}
```

### Correct OCR Data

#### Manually Correct Extracted Data
```http
PUT /api/receipts/:id/correct
Authorization: Bearer <token>
Content-Type: application/json

{
  "merchant_name": "Starbucks Coffee Co.",
  "total_amount": 455,
  "date": "2024-01-15",
  "category": "food"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "extracted_data": {
      "merchant_name": "Starbucks Coffee Co.",
      "total_amount": 455,
      "date": "2024-01-15T00:00:00.000Z",
      "category": "food"
    },
    "manually_corrected": true,
    "correction_history": [
      {
        "field": "total_amount",
        "old_value": 450,
        "new_value": 455,
        "corrected_at": "2024-01-15T11:00:00.000Z"
      }
    ]
  },
  "message": "Receipt data corrected successfully"
}
```

### Delete Receipt

#### Delete Receipt
```http
DELETE /api/receipts/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Receipt deleted successfully"
}
```

### Search Receipts

#### Full-Text Search
```http
GET /api/receipts/search?q=starbucks+coffee
Authorization: Bearer <token>
```

**Query Parameters:**
- `q`: Search query (required)
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

Searches across:
- Merchant name
- Processed OCR text
- Notes
- Tags

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "extracted_data": {
        "merchant_name": "Starbucks Coffee"
      },
      "confidence_scores": {
        "overall": 92
      }
    }
  ]
}
```

### Receipt Statistics

#### Get Receipt Statistics
```http
GET /api/receipts/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_receipts": 150,
    "by_status": {
      "pending": 5,
      "processing": 2,
      "completed": 120,
      "failed": 3,
      "confirmed": 20
    },
    "by_category": [
      {
        "_id": "food",
        "count": 45,
        "total_amount": 25000
      },
      {
        "_id": "transport",
        "count": 30,
        "total_amount": 15000
      }
    ]
  }
}
```

### Pending & Unconfirmed Receipts

#### Get Pending Receipts
```http
GET /api/receipts/pending
Authorization: Bearer <token>
```

Returns receipts in 'pending' or 'processing' status.

#### Get Unconfirmed Receipts
```http
GET /api/receipts/unconfirmed
Authorization: Bearer <token>
```

Returns completed receipts that haven't been converted to expenses yet.

### Folder Management

#### Create Folder
```http
POST /api/receipts/folders
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Business Receipts",
  "description": "All business-related receipts",
  "color": "#3498db",
  "icon": "briefcase",
  "parent_folder": null
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "name": "Business Receipts",
    "path": "/Business Receipts",
    "color": "#3498db",
    "metadata": {
      "document_count": 0,
      "total_size": 0
    }
  }
}
```

#### Get Folder Tree
```http
GET /api/receipts/folders/tree
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "name": "Business",
      "path": "/Business",
      "children": [
        {
          "_id": "64a1b2c3d4e5f6789abcdef1",
          "name": "Travel",
          "path": "/Business/Travel",
          "children": []
        }
      ]
    }
  ]
}
```

#### Move Receipt to Folder
```http
PUT /api/receipts/:id/folder
Authorization: Bearer <token>
Content-Type: application/json

{
  "folder_id": "64a1b2c3d4e5f6789abcdef0"
}
```

### Tag Management

#### Add Tag to Receipt
```http
POST /api/receipts/:id/tags
Authorization: Bearer <token>
Content-Type: application/json

{
  "tag": "business"
}
```

#### Remove Tag from Receipt
```http
DELETE /api/receipts/:id/tags/:tag
Authorization: Bearer <token>
```

#### Get All Tags
```http
GET /api/receipts/tags
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tags": ["business", "personal", "travel", "food", "transport"],
    "tag_counts": {
      "business": 45,
      "personal": 30,
      "travel": 15
    }
  }
}
```

## Usage Examples

### 1. Upload and Process Receipt

```javascript
const formData = new FormData();
formData.append('file', receiptImage);

const response = await fetch('/api/receipts/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const { data } = await response.json();
console.log('Receipt ID:', data._id);
console.log('Status:', data.status); // 'processing'

// Poll for completion
const checkStatus = async (receiptId) => {
  const statusResponse = await fetch(`/api/receipts/${receiptId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { data: receipt } = await statusResponse.json();
  
  if (receipt.status === 'completed') {
    console.log('Extracted data:', receipt.extracted_data);
    return receipt;
  } else if (receipt.status === 'failed') {
    console.error('OCR failed:', receipt.processing_error);
    return null;
  }
  
  // Still processing, check again
  setTimeout(() => checkStatus(receiptId), 2000);
};

await checkStatus(data._id);
```

### 2. Search and Filter Receipts

```javascript
// Search by merchant
const searchResponse = await fetch('/api/receipts/search?q=starbucks', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Filter by date and amount
const filterResponse = await fetch(
  '/api/receipts?start_date=2024-01-01&end_date=2024-01-31&min_amount=100&max_amount=1000&category=food',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

const { data: receipts } = await filterResponse.json();
console.log('Found receipts:', receipts.length);
```

### 3. Correct and Confirm Receipt

```javascript
const receiptId = '64a1b2c3d4e5f6789abcdef0';

// Correct any OCR errors
await fetch(`/api/receipts/${receiptId}/correct`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    total_amount: 455,
    merchant_name: 'Starbucks Coffee'
  })
});

// Confirm and create expense
const confirmResponse = await fetch(`/api/receipts/${receiptId}/confirm`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    notes: 'Team lunch meeting'
  })
});

const { data } = await confirmResponse.json();
console.log('Created expense:', data.expense._id);
```

### 4. Organize with Folders and Tags

```javascript
// Create folder structure
const businessFolder = await fetch('/api/receipts/folders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Business',
    color: '#3498db'
  })
});

const { data: folder } = await businessFolder.json();

// Move receipt to folder
await fetch(`/api/receipts/${receiptId}/folder`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    folder_id: folder._id
  })
});

// Add tags
await fetch(`/api/receipts/${receiptId}/tags`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tag: 'business'
  })
});
```

## OCR Data Extraction

### Supported Data Fields

The OCR service automatically extracts:

- **Merchant Information**:
  - Name
  - Address
  - Phone number

- **Transaction Details**:
  - Total amount
  - Subtotal
  - Tax amount
  - Tip amount
  - Discount amount
  - Currency

- **Date & Time**:
  - Transaction date
  - Transaction time

- **Payment Information**:
  - Payment method (cash, credit, debit, UPI)
  - Last 4 digits of card
  - Transaction ID
  - Invoice number

- **Line Items**:
  - Item description
  - Quantity
  - Unit price
  - Total price

- **Category**:
  - Auto-inferred from merchant name and items
  - Categories: food, transport, shopping, entertainment, utilities, health, education, other

### Confidence Scores

Each receipt gets confidence scores:

- **Overall** (0-100): Weighted average of all scores
- **Merchant** (0-100): Confidence in merchant name extraction
- **Amount** (0-100): Confidence in total amount extraction
- **Date** (0-100): Confidence in date extraction

**Confidence Levels**:
- High: ≥90% (Green)
- Medium: 70-89% (Yellow)
- Low: <70% (Red)

Receipts with low confidence scores should be manually reviewed.

## Duplicate Detection

The system uses image hashing to detect duplicate receipts:

1. **Hash Generation**: Each uploaded image gets a perceptual hash
2. **Duplicate Check**: Compares hash against existing receipts
3. **Flagging**: Duplicates are flagged with `is_duplicate: true`
4. **Reference**: `duplicate_of` field points to original receipt

**Note**: Duplicate receipts can still be processed but are marked for review.

## Best Practices

1. **Image Quality**:
   - Use clear, well-lit photos
   - Ensure receipt is fully visible and in focus
   - Avoid shadows and glare
   - Supported formats: JPG, PNG, PDF

2. **Review OCR Results**:
   - Always check confidence scores
   - Review receipts with confidence < 70%
   - Manually correct errors before confirming

3. **Organization**:
   - Create folders for different expense categories
   - Use tags for easy filtering
   - Move processed receipts to appropriate folders

4. **Regular Cleanup**:
   - Review and confirm pending receipts weekly
   - Delete failed or duplicate receipts
   - Archive old receipts

5. **Expense Creation**:
   - Confirm receipts to create expenses automatically
   - Add notes before confirming for better tracking
   - Double-check amounts and categories

## Troubleshooting

### OCR Failed

**Causes**:
- Poor image quality
- Handwritten receipts (not supported)
- Non-English text (if using Tesseract)
- Damaged or faded receipts

**Solutions**:
- Retake photo with better lighting
- Try Google Cloud Vision (more accurate)
- Manually enter data

### Low Confidence Scores

**Solutions**:
- Review extracted data
- Manually correct errors
- Retake photo if possible

### Duplicate Detection Issues

**False Positives**:
- Different receipts flagged as duplicates
- Check image hash manually
- Report if persistent

**False Negatives**:
- Duplicate receipts not detected
- May occur with low-quality images
- Manually mark as duplicate

### Processing Timeout

If receipt stays in 'processing' status for >5 minutes:
1. Check server logs
2. Refresh receipt status
3. Re-upload if still stuck

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common HTTP Status Codes**:
- `200`: Success
- `201`: Created
- `400`: Bad request / validation error
- `401`: Unauthorized
- `404`: Not found
- `413`: File too large
- `415`: Unsupported media type
- `500`: Server error

## Security

- JWT authentication required for all endpoints
- Receipts are private to uploading user
- Images stored securely on Cloudinary
- File size limits enforced (10MB max)
- Supported formats validated
- Malicious file upload prevention

## Performance

- **OCR Processing**: 2-10 seconds per receipt
- **Duplicate Detection**: <1 second
- **Image Upload**: Depends on file size and connection
- **Search**: Full-text search indexed for fast results

## Limitations

- Maximum file size: 10MB
- Supported formats: JPG, PNG, PDF
- OCR accuracy depends on image quality
- Handwritten receipts not supported
- Best results with printed receipts in English

## Future Enhancements

- Multi-language OCR support
- Bulk upload processing
- Advanced duplicate detection (similar amounts/dates)
- Receipt templates for common merchants
- Mobile app integration
- Batch expense creation
- Export receipt data (CSV, PDF)

## License

MIT License - see LICENSE file for details
