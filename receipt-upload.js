// Receipt Upload Integration
class ReceiptManager {
  constructor() {
    this.apiUrl = '/api';
    this.authToken = localStorage.getItem('token');
    this.initializeUploadArea();
  }

  formatCurrency(value) {
    const formatter = window.i18n?.formatCurrency;
    if (typeof formatter === 'function') return formatter(value);
    const numericValue = Number(value) || 0;
    const symbol = window.i18n?.getCurrencySymbol?.(window.i18n?.getCurrency?.() || '') || '';
    return `${symbol}${numericValue.toFixed(2)}`;
  }

  // Initialize drag and drop upload area
  initializeUploadArea() {
    // Create upload area HTML
    const uploadHTML = `
      <div id="receipt-upload-area" class="upload-area" style="display: none;">
        <div class="upload-zone" id="upload-zone">
          <i class="fas fa-cloud-upload-alt"></i>
          <p>Drag & drop receipt here or <span class="upload-link">browse files</span></p>
          <input type="file" id="receipt-input" accept="image/*,.pdf" style="display: none;">
          <div class="upload-progress" id="upload-progress" style="display: none;">
            <div class="progress-bar"></div>
            <span class="progress-text">Uploading...</span>
          </div>
        </div>
        <div class="ocr-results" id="ocr-results" style="display: none;">
          <h4>📄 Extracted Information</h4>
          <div class="ocr-data">
            <div class="ocr-item">
              <label>Amount:</label>
              <span id="ocr-amount">-</span>
            </div>
            <div class="ocr-item">
              <label>Date:</label>
              <span id="ocr-date">-</span>
            </div>
            <div class="ocr-item">
              <label>Confidence:</label>
              <span id="ocr-confidence">-</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add to expense form
    const expenseForm = document.getElementById('form');
    if (expenseForm) {
      expenseForm.insertAdjacentHTML('afterend', uploadHTML);
      this.setupEventListeners();
      this.addUploadStyles();
    }
  }

  // Setup event listeners
  setupEventListeners() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('receipt-input');
    const uploadLink = document.querySelector('.upload-link');

    // Drag and drop events
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileUpload(files[0]);
      }
    });

    // Click to browse
    uploadLink.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFileUpload(e.target.files[0]);
      }
    });
  }

  // Show upload area for specific expense
  showUploadArea(expenseId) {
    this.currentExpenseId = expenseId;
    const uploadArea = document.getElementById('receipt-upload-area');
    uploadArea.style.display = 'block';
  }

  // Hide upload area
  hideUploadArea() {
    const uploadArea = document.getElementById('receipt-upload-area');
    uploadArea.style.display = 'none';
    this.resetUploadState();
  }

  // Handle file upload
  async handleFileUpload(file) {
    if (!this.currentExpenseId) {
      this.showNotification('Please select an expense first', 'error');
      return;
    }

    // Validate file
    if (!this.validateFile(file)) return;

    const formData = new FormData();
    formData.append('receipt', file);

    try {
      this.showUploadProgress();

      const response = await fetch(`${this.apiUrl}/receipts/upload/${this.currentExpenseId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      const result = await response.json();
      this.showUploadSuccess(result.receipt);

      // Display OCR results if available
      if (result.receipt.ocrData) {
        this.displayOCRResults(result.receipt.ocrData);
      }

    } catch (error) {
      this.showNotification(error.message, 'error');
      this.hideUploadProgress();
    }
  }

  // Validate file
  validateFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      this.showNotification('Invalid file type. Only JPEG, PNG, and PDF files are allowed.', 'error');
      return false;
    }

    if (file.size > maxSize) {
      this.showNotification('File size too large. Maximum size is 10MB.', 'error');
      return false;
    }

    return true;
  }

  // Show upload progress
  showUploadProgress() {
    const progress = document.getElementById('upload-progress');
    progress.style.display = 'block';

    // Animate progress bar
    const progressBar = progress.querySelector('.progress-bar');
    progressBar.style.width = '0%';

    let width = 0;
    const interval = setInterval(() => {
      width += 10;
      progressBar.style.width = width + '%';
      if (width >= 90) clearInterval(interval);
    }, 100);
  }

  // Hide upload progress
  hideUploadProgress() {
    const progress = document.getElementById('upload-progress');
    progress.style.display = 'none';
  }

  // Show upload success
  showUploadSuccess(receipt) {
    this.hideUploadProgress();
    this.showNotification('Receipt uploaded successfully! 📄', 'success');

    // Add receipt indicator to expense
    this.addReceiptIndicator(this.currentExpenseId, receipt);
  }

  // Display OCR results
  displayOCRResults(ocrData) {
    const ocrResults = document.getElementById('ocr-results');
    const amountSpan = document.getElementById('ocr-amount');
    const dateSpan = document.getElementById('ocr-date');
    const confidenceSpan = document.getElementById('ocr-confidence');

    amountSpan.textContent = ocrData.extractedAmount ? this.formatCurrency(ocrData.extractedAmount) : 'Not found';
    dateSpan.textContent = ocrData.extractedDate ? new Date(ocrData.extractedDate).toLocaleDateString() : 'Not found';
    confidenceSpan.textContent = `${(ocrData.confidence || 0).toFixed(1)}%`;

    ocrResults.style.display = 'block';

    // Auto-fill expense form if OCR data is good
    if (ocrData.confidence > 70 && ocrData.extractedAmount) {
      const amountInput = document.getElementById('amount');
      if (amountInput && !amountInput.value) {
        amountInput.value = ocrData.extractedAmount;
        this.showNotification('Amount auto-filled from receipt! ✨', 'info');
      }
    }
  }

  // Add receipt indicator to expense item
  addReceiptIndicator(expenseId, receipt) {
    const expenseItem = document.querySelector(`[data-expense-id="${expenseId}"]`);
    if (expenseItem) {
      const indicator = document.createElement('span');
      indicator.className = 'receipt-indicator';
      indicator.innerHTML = '📄';
      indicator.title = 'Has receipt';
      expenseItem.querySelector('.transaction-content').appendChild(indicator);
    }
  }

  // Reset upload state
  resetUploadState() {
    const fileInput = document.getElementById('receipt-input');
    const ocrResults = document.getElementById('ocr-results');
    const progress = document.getElementById('upload-progress');

    fileInput.value = '';
    ocrResults.style.display = 'none';
    progress.style.display = 'none';
  }

  // Get receipts for expense
  async getReceiptsForExpense(expenseId) {
    try {
      const response = await fetch(`${this.apiUrl}/receipts/expense/${expenseId}`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch receipts');
      return await response.json();
    } catch (error) {
      console.error('Error fetching receipts:', error);
      return [];
    }
  }

  // Add upload styles
  addUploadStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .upload-area {
        margin: 20px 0;
        padding: 20px;
        border: 2px dashed #ddd;
        border-radius: 10px;
        background: #f9f9f9;
      }
      
      .upload-zone {
        text-align: center;
        padding: 40px 20px;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .upload-zone:hover, .upload-zone.drag-over {
        border-color: #667eea;
        background: #f0f4ff;
      }
      
      .upload-zone i {
        font-size: 3rem;
        color: #667eea;
        margin-bottom: 10px;
      }
      
      .upload-link {
        color: #667eea;
        cursor: pointer;
        text-decoration: underline;
      }
      
      .upload-progress {
        margin-top: 20px;
      }
      
      .progress-bar {
        height: 4px;
        background: #667eea;
        border-radius: 2px;
        transition: width 0.3s ease;
      }
      
      .progress-text {
        display: block;
        margin-top: 10px;
        color: #666;
      }
      
      .ocr-results {
        margin-top: 20px;
        padding: 15px;
        background: white;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
      }
      
      .ocr-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      
      .ocr-item label {
        font-weight: bold;
        color: #333;
      }
      
      .receipt-indicator {
        margin-left: 10px;
        font-size: 1.2rem;
      }
    `;
    document.head.appendChild(style);
  }

  // Show notification
  showNotification(message, type = 'info') {
    // Use existing notification system
    if (window.ExpenseSync && window.ExpenseSync.showNotification) {
      window.ExpenseSync.showNotification(message, type);
    } else {
      alert(message);
    }
  }
}

// Initialize receipt manager
const receiptManager = new ReceiptManager();

// Add upload button to expense items
function addReceiptUploadButtons() {
  const expenseItems = document.querySelectorAll('.transaction-content');
  expenseItems.forEach(item => {
    if (!item.querySelector('.upload-btn')) {
      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'upload-btn';
      uploadBtn.innerHTML = '📎 Add Receipt';
      uploadBtn.onclick = (e) => {
        e.stopPropagation();
        const expenseId = item.closest('li').dataset.expenseId;
        receiptManager.showUploadArea(expenseId);
      };
      item.appendChild(uploadBtn);
    }
  });
}

// Auto-add upload buttons when transactions are displayed
const originalDisplayTransactions = window.displayTransactions;
if (originalDisplayTransactions) {
  window.displayTransactions = function () {
    originalDisplayTransactions.call(this);
    setTimeout(addReceiptUploadButtons, 100);
  };
}

// Export for global use
window.ReceiptManager = receiptManager;