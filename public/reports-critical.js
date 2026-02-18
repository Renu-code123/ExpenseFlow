// Reports & Export Dashboard - Critical JavaScript (Above the fold functionality)

export function handleQuickExport(type) {
    alert(`${type.charAt(0).toUpperCase() + type.slice(1)} report has been exported successfully!`);
}

export function handleFormSubmit(event) {
    event.preventDefault();

    if (validateForm(event.target)) {
        alert('Custom report has been generated successfully!');
    }
}

export function validateForm(form) {
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.style.borderColor = '#ff5722';
            isValid = false;
        } else {
            field.style.borderColor = '#ddd';
        }
    });

    return isValid;
}

export function previewReport() {
    // Lazy load preview modal
    import('./reports-modal.js').then(module => {
        module.openPreviewModal();
    });
}

export function downloadReport(reportName) {
    alert(`"${reportName}" has been downloaded successfully!`);
}