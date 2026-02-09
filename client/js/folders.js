/**
 * Folders Management Logic
 */

const FOLDERS_API_URL = '/api/folders';
let currentFolders = [];
let currentFolderId = null;

/**
 * Initialize Folders Module
 */
function initFolders() {
    fetchFolders();
    setupFolderEventListeners();
}

/**
 * Fetch and Render Folders
 */
async function fetchFolders() {
    try {
        const response = await fetch(FOLDERS_API_URL, {
            headers: await getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to fetch folders');

        currentFolders = await response.json();
        renderFoldersSidebar();
        renderFoldersGrid();
        populateFolderDropdowns();

    } catch (error) {
        console.error('Error fetching folders:', error);
        showNotification('Failed to load folders', 'error');
    }
}

/**
 * Render Folders in Sidebar/Nav (if applicable) or Main View
 */
function renderFoldersSidebar() {
    // Optional: Add counts to sidebar if implemented
}

/**
 * Render Main Folders Grid
 */
function renderFoldersGrid() {
    const grid = document.getElementById('folders-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Add "New Folder" Card
    const newFolderCard = document.createElement('div');
    newFolderCard.className = 'folder-card create-new';
    newFolderCard.innerHTML = `
        <i class="fas fa-plus"></i>
        <span>New Folder</span>
    `;
    newFolderCard.onclick = openCreateFolderModal;
    grid.appendChild(newFolderCard);

    // Render existing folders
    currentFolders.forEach(folder => {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.style.borderTop = `4px solid ${folder.color || '#3b82f6'}`;
        card.innerHTML = `
            <div class="folder-header">
                <i class="fas fa-${folder.icon || 'folder'}" style="color: ${folder.color}"></i>
                <div class="folder-actions">
                    <button onclick="editFolder('${folder._id}', event)"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteFolder('${folder._id}', event)"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <h4 class="folder-name">${escapeHtml(folder.name)}</h4>
            <p class="folder-info">
                 <span class="view-btn">View Receipts</span>
            </p>
        `;
        card.onclick = (e) => {
            if (!e.target.closest('button')) {
                openFolder(folder._id, folder.name);
            }
        };
        grid.appendChild(card);
    });
}

/**
 * Populate Folder Select Dropdowns (e.g. in OCR modal)
 */
function populateFolderDropdowns() {
    const dropdowns = document.querySelectorAll('.folder-select');

    dropdowns.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Unfiled (Root)</option>';

        currentFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder._id;
            option.textContent = folder.name;
            select.appendChild(option);
        });

        // Restore selection if valid
        if (currentValue) select.value = currentValue;
    });
}

/**
 * Create New Folder
 */
async function createFolder(name, color) {
    try {
        const response = await fetch(FOLDERS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...await getAuthHeaders()
            },
            body: JSON.stringify({ name, color })
        });

        if (!response.ok) throw new Error('Failed to create folder');

        showNotification('Folder created successfully', 'success');
        fetchFolders();
        closeCreateFolderModal();

    } catch (error) {
        console.error('Error creating folder:', error);
        showNotification(error.message || 'Failed to create folder', 'error');
    }
}

/**
 * Delete Folder
 */
async function deleteFolder(id, event) {
    if (event) event.stopPropagation();

    if (!confirm('Are you sure? Receipts in this folder will be moved to Unfiled.')) {
        return;
    }

    try {
        const response = await fetch(`${FOLDERS_API_URL}/${id}`, {
            method: 'DELETE',
            headers: await getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to delete folder');

        showNotification('Folder deleted', 'success');
        fetchFolders();

    } catch (error) {
        showNotification('Failed to delete folder', 'error');
    }
}

/**
 * Open Folder View
 */
function openFolder(folderId, folderName) {
    currentFolderId = folderId;
    document.getElementById('current-folder-title').textContent = folderName || 'Unfiled Receipts';

    // Switch to receipts list view and filter by folderId
    // Assuming we reuse the existing transaction/receipt list or create a new one
    // For now, let's assume we have a list container in the folders component
    fetchReceiptsByFolder(folderId);
}

/**
 * Fetch Receipts for a specific folder
 */
async function fetchReceiptsByFolder(folderId) {
    const container = document.getElementById('folder-receipts-list');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading receipts...</div>';

    try {
        let url = `/api/receipts`;
        if (folderId) {
            url += `?folderId=${folderId}`;
        } else {
            url += `?folderId=null`; // For "Unfiled"
        }

        const response = await fetch(url, {
            headers: await getAuthHeaders()
        });

        const receipts = await response.json();
        renderReceiptsList(receipts, container);

    } catch (error) {
        container.innerHTML = '<div class="error">Failed to load receipts</div>';
    }
}

function renderReceiptsList(receipts, container) {
    if (receipts.length === 0) {
        container.innerHTML = '<div class="empty-state">No receipts in this folder</div>';
        return;
    }

    container.innerHTML = '';
    receipts.forEach(receipt => {
        const div = document.createElement('div');
        div.className = 'receipt-item';
        div.innerHTML = `
            <div class="receipt-icon"><i class="fas fa-receipt"></i></div>
            <div class="receipt-info">
                <h4>${escapeHtml(receipt.merchant || receipt.originalName)}</h4>
                <p>${new Date(receipt.createdAt).toLocaleDateString()} • ${formatCurrency(receipt.ocrData?.extractedAmount || 0)}</p>
            </div>
            <div class="receipt-actions">
                <a href="${receipt.fileUrl}" target="_blank" class="btn-icon"><i class="fas fa-eye"></i></a>
                <button onclick="moveReceipt('${receipt._id}')" class="btn-icon"><i class="fas fa-folder-open"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
}

/**
 * UI Helper Functions
 */
function openCreateFolderModal() {
    const modal = document.getElementById('create-folder-modal');
    if (modal) modal.classList.add('active');
}

function closeCreateFolderModal() {
    const modal = document.getElementById('create-folder-modal');
    if (modal) modal.classList.remove('active');
    document.getElementById('new-folder-name').value = '';
}

function setupFolderEventListeners() {
    document.getElementById('save-folder-btn')?.addEventListener('click', () => {
        const name = document.getElementById('new-folder-name').value;
        const color = document.getElementById('new-folder-color').value;
        if (name) createFolder(name, color);
    });
}

// Expose to window
window.initFolders = initFolders;
window.fetchFolders = fetchFolders; // for updates
window.fetchReceiptsByFolder = fetchReceiptsByFolder; // for external calls

/**
 * Helper Functions
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(value) {
    if (window.i18n && typeof window.i18n.formatCurrency === 'function') {
        return window.i18n.formatCurrency(value);
    }
    return '₹' + parseFloat(value).toFixed(2);
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', initFolders);
