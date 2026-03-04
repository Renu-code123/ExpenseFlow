class ImportModalManager {
    constructor() {
        this.file = null;
        this.init();
    }

    init() {
        // We will bind events after the modal HTML is injected or we can rely on onclick attributes
    }

    openModal() {
        const modal = document.getElementById('importModal');
        if (modal) {
            modal.style.display = 'block';
            this.resetForm();
        }
    }

    closeModal() {
        const modal = document.getElementById('importModal');
        if (modal) {
            modal.style.display = 'none';
            this.resetForm();
        }
    }

    resetForm() {
        this.file = null;
        const fileInput = document.getElementById('importFile');
        if (fileInput) fileInput.value = '';

        const preview = document.getElementById('filePreview');
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }

        const error = document.getElementById('importError');
        if (error) {
            error.style.display = 'none';
            error.textContent = '';
        }

        const success = document.getElementById('importSuccess');
        if (success) {
            success.style.display = 'none';
            success.textContent = '';
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        const validTypes = ['.csv', '.json', 'application/json', 'text/csv', 'application/vnd.ms-excel'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

        // Simple client-side validation
        if (file.size > 10 * 1024 * 1024) {
            this.showError('File size exceeds 10MB limit.');
            this.resetForm();
            return;
        }

        this.file = file;
        this.showPreview(file);
        this.showError(''); // Clear error
    }

    showPreview(file) {
        const preview = document.getElementById('filePreview');
        if (preview) {
            preview.innerHTML = `
                <div class="file-info">
                    <i class="fas ${file.name.endsWith('.csv') ? 'fa-file-csv' : 'fa-file-code'}"></i>
                    <span>${file.name}</span>
                    <small>(${(file.size / 1024).toFixed(2)} KB)</small>
                </div>
            `;
            preview.style.display = 'block';
        }
    }

    showError(message) {
        const error = document.getElementById('importError');
        if (error) {
            error.textContent = message;
            error.style.display = message ? 'block' : 'none';
        }
    }

    showSuccess(message) {
        const success = document.getElementById('importSuccess');
        if (success) {
            success.textContent = message;
            success.style.display = message ? 'block' : 'none';
        }
    }

    async uploadFile() {
        if (!this.file) {
            this.showError('Please select a file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('receipt', this.file); // Using 'receipt' as field name to match uploadMiddleware config

        const submitBtn = document.getElementById('btnImportSubmit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
        }

        try {
            const response = await fetch('/api/expenses/import', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess(data.message);
                this.showError('');

                // Show imported/skipped stats
                setTimeout(() => {
                    this.closeModal();
                    if (window.transactionsManager) {
                        window.transactionsManager.loadTransactions();
                        window.transactionsManager.showNotification(data.message, 'success');
                    } else {
                        location.reload();
                    }
                }, 2000); // Wait 2s to show success message in modal
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload Error:', error);
            this.showError(error.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-file-import"></i> Import Transactions';
            }
        }
    }
}

const importModalManager = new ImportModalManager();

// Expose functions globally for onclick handlers
function openImportModal() {
    importModalManager.openModal();
}

function closeImportModal() {
    importModalManager.closeModal();
}

function handleImportFileSelect(event) {
    importModalManager.handleFileSelect(event);
}

function submitImport() {
    importModalManager.uploadFile();
}
