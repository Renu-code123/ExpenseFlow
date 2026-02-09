/**
 * Receipt OCR Frontend Logic
 * Deep OCR with Line Item Extraction & Multi-Expense Split
 */
const RECEIPT_API_URL = 'http://localhost:3000/api/receipts';

let currentScanData = null;
let currentItemizedData = null;

async function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

/**
 * Handle receipt file selection and upload for scanning
 * Uses deep scan endpoint for itemization
 */
async function handleReceiptScan(file, useDeepScan = true) {
    if (!file) return;

    showOCRNotification('Scanning receipt... This may take a few seconds.', 'info');
    toggleOverlay(true, 'AI is reading your receipt...');

    const formData = new FormData();
    formData.append('receipt', file);

    try {
        const endpoint = useDeepScan ? `${RECEIPT_API_URL}/scan-deep` : `${RECEIPT_API_URL}/scan`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: formData
        });

        const result = await response.json();
        toggleOverlay(false);

        if (!response.ok) throw new Error(result.error || 'Failed to scan receipt');

        currentScanData = result.data;

        // Check if we have multiple items for itemization
        if (useDeepScan && result.data.hasMultipleItems && result.data.items?.length > 1) {
            currentItemizedData = result.data;
            openItemizedModal(result.data);
        } else {
            openOCRResultModal(result.data);
        }
    } catch (error) {
        toggleOverlay(false);
        console.error('Scan error:', error);
        showOCRNotification(error.message, 'error');
    }
}

/**
 * Open the itemized receipt modal for multi-item receipts
 */
function openItemizedModal(data) {
    const modal = document.getElementById('ocr-itemized-modal');
    if (!modal) {
        // Fallback to regular modal if itemized modal doesn't exist
        openOCRResultModal(data);
        return;
    }

    // Set receipt header info
    document.getElementById('itemized-merchant').textContent = data.merchant || 'Unknown Merchant';
    document.getElementById('itemized-date').textContent = data.date ? new Date(data.date).toLocaleDateString() : new Date().toLocaleDateString();
    document.getElementById('itemized-total').textContent = formatCurrency(data.amount || 0);
    document.getElementById('itemized-count').textContent = `${data.items.length} items detected`;

    // Set preview image
    const previewImg = document.getElementById('itemized-preview-img');
    if (previewImg && data.fileUrl) {
        previewImg.src = data.fileUrl;
    }

    // Confidence bar
    const confidenceBar = document.getElementById('itemized-confidence-bar');
    if (confidenceBar) {
        confidenceBar.style.width = `${data.confidence}%`;
        confidenceBar.className = `progress-fill ${data.confidence > 80 ? 'high' : (data.confidence > 50 ? 'medium' : 'low')}`;
    }

    // Populate items list
    const itemsList = document.getElementById('itemized-list');
    itemsList.innerHTML = '';

    data.items.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'itemized-row';
        itemRow.innerHTML = `
            <div class="item-checkbox">
                <input type="checkbox" id="item-${index}" checked data-index="${index}">
            </div>
            <div class="item-details">
                <input type="text" class="item-name" value="${escapeHtml(item.name || item.description || 'Item')}" data-field="name" data-index="${index}">
                <select class="item-category" data-field="category" data-index="${index}">
                    <option value="food" ${item.category === 'food' ? 'selected' : ''}>Food & Dining</option>
                    <option value="shopping" ${item.category === 'shopping' ? 'selected' : ''}>Shopping</option>
                    <option value="healthcare" ${item.category === 'healthcare' ? 'selected' : ''}>Healthcare</option>
                    <option value="transport" ${item.category === 'transport' ? 'selected' : ''}>Transport</option>
                    <option value="utilities" ${item.category === 'utilities' ? 'selected' : ''}>Utilities</option>
                    <option value="entertainment" ${item.category === 'entertainment' ? 'selected' : ''}>Entertainment</option>
                    <option value="other" ${item.category === 'other' || !item.category ? 'selected' : ''}>Other</option>
                </select>
            </div>
            <div class="item-qty">
                <input type="number" class="item-quantity" value="${item.quantity || 1}" min="1" data-field="quantity" data-index="${index}">
            </div>
            <div class="item-price">
                <input type="number" class="item-amount" value="${item.price || item.amount || 0}" step="0.01" data-field="price" data-index="${index}">
            </div>
        `;
        itemsList.appendChild(itemRow);
    });

    // Update total on any change
    itemsList.addEventListener('change', updateItemizedTotal);
    itemsList.addEventListener('input', updateItemizedTotal);

    modal.classList.add('active');
}

/**
 * Update the total based on selected items
 */
function updateItemizedTotal() {
    if (!currentItemizedData) return;

    let total = 0;
    const checkboxes = document.querySelectorAll('#itemized-list input[type="checkbox"]:checked');

    checkboxes.forEach(checkbox => {
        const index = checkbox.dataset.index;
        const priceInput = document.querySelector(`.item-amount[data-index="${index}"]`);
        const qtyInput = document.querySelector(`.item-quantity[data-index="${index}"]`);
        const price = parseFloat(priceInput?.value) || 0;
        const qty = parseInt(qtyInput?.value) || 1;
        total += price * qty;
    });

    document.getElementById('itemized-selected-total').textContent = formatCurrency(total);

    const selectedCount = checkboxes.length;
    document.getElementById('itemized-selected-count').textContent = `${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected`;
}

/**
 * Select/deselect all items
 */
function toggleAllItems(selectAll) {
    const checkboxes = document.querySelectorAll('#itemized-list input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = selectAll);
    updateItemizedTotal();
}

/**
 * Save all selected items as separate expenses
 */
async function saveItemizedExpenses() {
    if (!currentItemizedData) return;

    const selectedItems = [];
    const checkboxes = document.querySelectorAll('#itemized-list input[type="checkbox"]:checked');

    checkboxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index);
        const nameInput = document.querySelector(`.item-name[data-index="${index}"]`);
        const categorySelect = document.querySelector(`.item-category[data-index="${index}"]`);
        const qtyInput = document.querySelector(`.item-quantity[data-index="${index}"]`);
        const priceInput = document.querySelector(`.item-amount[data-index="${index}"]`);

        selectedItems.push({
            name: nameInput?.value || currentItemizedData.items[index]?.name || 'Item',
            category: categorySelect?.value || currentItemizedData.items[index]?.category || 'other',
            quantity: parseInt(qtyInput?.value) || 1,
            price: parseFloat(priceInput?.value) || 0,
            originalIndex: index
        });
    });

    if (selectedItems.length === 0) {
        showOCRNotification('Please select at least one item to save.', 'warning');
        return;
    }

    try {
        toggleOverlay(true, `Creating ${selectedItems.length} expense${selectedItems.length > 1 ? 's' : ''}...`);

        const response = await fetch(`${RECEIPT_API_URL}/save-itemized`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...await getAuthHeaders()
            },
            body: JSON.stringify({
                merchant: currentItemizedData.merchant,
                date: currentItemizedData.date,
                items: selectedItems,
                fileUrl: currentItemizedData.fileUrl,
                cloudinaryId: currentItemizedData.cloudinaryId,
                originalName: currentItemizedData.originalName
            })
        });

        const result = await response.json();
        toggleOverlay(false);

        if (!response.ok) throw new Error(result.error || 'Failed to save expenses');

        showOCRNotification(`Successfully created ${result.expenses?.length || selectedItems.length} expense${selectedItems.length > 1 ? 's' : ''} from receipt!`, 'success');
        closeItemizedModal();

        // Trigger dashboard refresh
        if (typeof updateAllData === 'function') updateAllData();
        else if (typeof fetchExpenses === 'function') fetchExpenses();

    } catch (error) {
        toggleOverlay(false);
        showOCRNotification(error.message, 'error');
    }
}

/**
 * Save as single expense (combine all items)
 */
async function saveAsSingleExpense() {
    if (!currentItemizedData) return;

    // Calculate total from selected items
    let total = 0;
    const checkboxes = document.querySelectorAll('#itemized-list input[type="checkbox"]:checked');
    checkboxes.forEach(checkbox => {
        const index = checkbox.dataset.index;
        const priceInput = document.querySelector(`.item-amount[data-index="${index}"]`);
        const qtyInput = document.querySelector(`.item-quantity[data-index="${index}"]`);
        total += (parseFloat(priceInput?.value) || 0) * (parseInt(qtyInput?.value) || 1);
    });

    // Use regular save flow
    currentScanData = {
        ...currentItemizedData,
        amount: total
    };
    closeItemizedModal();
    openOCRResultModal(currentScanData);
}

function closeItemizedModal() {
    document.getElementById('ocr-itemized-modal')?.classList.remove('active');
    currentItemizedData = null;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(value) {
    if (window.i18n?.formatCurrency) {
        return window.i18n.formatCurrency(value);
    }
    return `$${parseFloat(value).toFixed(2)}`;
}

/**
 * Open Modal to show OCR results and allow confirmation (single expense)
 */
function openOCRResultModal(data) {
    const modal = document.getElementById('ocr-result-modal');
    if (!modal) return;

    // Fill modal fields
    document.getElementById('ocr-merchant').value = data.merchant || '';
    document.getElementById('ocr-amount').value = data.amount || '';
    document.getElementById('ocr-date').value = data.date ? new Date(data.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    document.getElementById('ocr-category').value = data.category || 'other';

    const previewImg = document.getElementById('ocr-preview-img');
    if (previewImg && data.fileUrl) {
        previewImg.src = data.fileUrl;
    }

    const confidenceBar = document.getElementById('ocr-confidence-bar');
    if (confidenceBar) {
        confidenceBar.style.width = `${data.confidence}%`;
        confidenceBar.className = `progress-fill ${data.confidence > 80 ? 'high' : (data.confidence > 50 ? 'medium' : 'low')}`;
    }

    // Show item count if available
    const itemCountEl = document.getElementById('ocr-item-count');
    if (itemCountEl && data.items?.length) {
        itemCountEl.textContent = `${data.items.length} items detected`;
        itemCountEl.style.display = 'block';
    } else if (itemCountEl) {
        itemCountEl.style.display = 'none';
    }

    // Populate folders if available
    if (window.initFolders && typeof window.fetchFolders === 'function') {
        // Ensure folders are loaded and dropdowns populated
        // This relies on folders.js being loaded
        window.fetchFolders();
    }

    modal.classList.add('active');
}

/**
 * Save confirmed data as a new expense
 */
async function saveScannedExpense() {
    if (!currentScanData) return;

    const confirmedData = {
        merchant: document.getElementById('ocr-merchant').value,
        amount: parseFloat(document.getElementById('ocr-amount').value),
        date: document.getElementById('ocr-date').value,
        category: document.getElementById('ocr-category').value,
        description: `Receipt from ${document.getElementById('ocr-merchant').value}`,
        fileUrl: currentScanData.fileUrl,
        cloudinaryId: currentScanData.cloudinaryId,
        originalName: currentScanData.originalName,
        folderId: document.getElementById('ocr-folder')?.value || null
    };

    try {
        toggleOverlay(true, 'Saving expense...');
        const response = await fetch(`${RECEIPT_API_URL}/save-scanned`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...await getAuthHeaders()
            },
            body: JSON.stringify(confirmedData)
        });

        const result = await response.json();
        toggleOverlay(false);

        if (!response.ok) throw new Error(result.error || 'Failed to save expense');

        showOCRNotification('Expense added successfully from receipt!', 'success');
        closeOCRModal();

        // Trigger dashboard refresh if available
        if (typeof updateAllData === 'function') updateAllData();
        else if (typeof fetchExpenses === 'function') fetchExpenses();

    } catch (error) {
        toggleOverlay(false);
        showOCRNotification(error.message, 'error');
    }
}

function closeOCRModal() {
    document.getElementById('ocr-result-modal')?.classList.remove('active');
    currentScanData = null;
}

function showOCRNotification(message, type = 'info') {
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        alert(message);
    }
}

function toggleOverlay(show, message = '') {
    const overlay = document.getElementById('ocr-loading-overlay');
    if (!overlay) return;

    if (show) {
        const loadingText = overlay.querySelector('.loading-text');
        if (loadingText) loadingText.textContent = message;
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    const scanInput = document.getElementById('receipt-scan-input');
    if (scanInput) {
        scanInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleReceiptScan(e.target.files[0], true); // Use deep scan by default
            }
        });
    }

    const saveBtn = document.getElementById('ocr-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveScannedExpense);
    }

    // Itemized modal buttons
    const saveItemizedBtn = document.getElementById('save-itemized-btn');
    if (saveItemizedBtn) {
        saveItemizedBtn.addEventListener('click', saveItemizedExpenses);
    }

    const saveSingleBtn = document.getElementById('save-single-btn');
    if (saveSingleBtn) {
        saveSingleBtn.addEventListener('click', saveAsSingleExpense);
    }

    const selectAllBtn = document.getElementById('select-all-items');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => toggleAllItems(true));
    }

    const deselectAllBtn = document.getElementById('deselect-all-items');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => toggleAllItems(false));
    }

    const closeItemizedBtn = document.getElementById('close-itemized-modal');
    if (closeItemizedBtn) {
        closeItemizedBtn.addEventListener('click', closeItemizedModal);
    }
});

// Export functions for external use
window.handleReceiptScan = handleReceiptScan;
window.saveItemizedExpenses = saveItemizedExpenses;
window.saveAsSingleExpense = saveAsSingleExpense;
window.toggleAllItems = toggleAllItems;
