/**
 * Controller for Expense Approvals and Submissions
 */

const API_APPROV = '/api/approvals';

document.addEventListener('DOMContentLoaded', () => {
    loadPendingApprovals();
    loadMySubmissions();
    updateStats();
});

async function loadPendingApprovals() {
    const container = document.getElementById('approvals-list');
    try {
        const res = await fetch(`${API_APPROV}/pending`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();

        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(item => `
        <div class="approval-card glass-card">
          <div class="card-user">
            <div class="avatar">${item.user.name[0]}</div>
            <div class="user-meta">
              <strong>${item.user.name}</strong>
              <small>${item.user.email}</small>
            </div>
          </div>
          <div class="card-details">
            <div class="amount">₹${item.amount.toLocaleString()}</div>
            <div class="desc">${item.description}</div>
            <div class="category-tag">${item.category}</div>
          </div>
          <div class="card-actions">
            <button class="btn-review" onclick="openReviewModal('${item._id}')">Review</button>
          </div>
        </div>
      `).join('');
        } else {
            container.innerHTML = '<div class="empty-state">No pending approvals found.</div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="error-state">Failed to load approvals</div>';
    }
}

async function loadMySubmissions() {
    const container = document.getElementById('submissions-list');
    // Reuse existing expenses API but filter by status if available
    try {
        const res = await fetch('/api/expenses', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        // In a real app we'd have a specific list for submissions
        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.slice(0, 10).map(item => `
            <div class="history-item">
                <div class="item-info">
                    <strong>${item.description}</strong>
                    <span>${new Date(item.date).toLocaleDateString()}</span>
                </div>
                <div class="item-status status-${item.approvalStatus || 'draft'}">
                    ${(item.approvalStatus || 'draft').replace('_', ' ')}
                </div>
            </div>
        `).join('');
        }
    } catch (err) {
        console.error('Error loading submissions:', err);
    }
}

let activeReviewId = null;

function openReviewModal(id) {
    activeReviewId = id;
    const modal = document.getElementById('review-modal');
    modal.classList.remove('hidden');
    document.getElementById('approver-comment').value = '';
}

document.querySelector('.close-modal').onclick = () => {
    document.getElementById('review-modal').classList.add('hidden');
};

async function processApproval(action) {
    const comment = document.getElementById('approver-comment').value;
    if (action === 'reject' && !comment) {
        alert('Please provide a reason for rejection.');
        return;
    }

    try {
        const res = await fetch(`${API_APPROV}/process/${activeReviewId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ action, comment })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('review-modal').classList.add('hidden');
            loadPendingApprovals();
            updateStats();
        }
    } catch (err) {
        console.error('Approval error:', err);
    }
}

async function updateStats() {
    // Mock stat update
    const pending = document.querySelectorAll('.approval-card').length;
    document.getElementById('pending-count').textContent = pending;
}
