/**
 * Smart Triggers & Automation Engine Frontend
 */

const ruleModal = document.getElementById('rule-modal');
const ruleForm = document.getElementById('rule-form');
const ruleList = document.getElementById('rule-list');

// Initialize Smart Triggers
async function initSmartTriggers() {
    await fetchRules();
}

/**
 * Fetch all rules and display them
 */
async function fetchRules() {
    try {
        const response = await fetch('/api/rules', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const rules = await response.json();
        displayRules(rules);
    } catch (error) {
        console.error('Error fetching rules:', error);
    }
}

/**
 * Display rules in the management panel
 */
function displayRules(rules) {
    if (!ruleList) return;
    ruleList.innerHTML = '';

    if (rules.length === 0) {
        ruleList.innerHTML = '<div class="empty-state">No automation rules created yet.</div>';
        return;
    }

    rules.forEach(rule => {
        const ruleItem = document.createElement('div');
        ruleItem.className = `rule-item ${rule.isActive ? 'active' : 'inactive'}`;
        ruleItem.innerHTML = `
      <div class="rule-info">
        <div class="rule-header">
          <h4>${rule.name}</h4>
          <span class="rule-status-badge">${rule.isActive ? 'Active' : 'Paused'}</span>
        </div>
        <p class="rule-desc">${rule.description || 'No description'}</p>
        <div class="rule-summary">
          <span class="trigger-label">If ${rule.trigger.field} ${rule.trigger.operator.replace('_', ' ')} "${rule.trigger.value}"</span>
          <i class="fas fa-arrow-right"></i>
          <span class="action-label">Then ${rule.actions[0].type.replace('_', ' ')}</span>
        </div>
        <div class="rule-stats">
          <span><i class="fas fa-play"></i> Executed: ${rule.executionCount} times</span>
          ${rule.lastExecuted ? `<span><i class="fas fa-clock"></i> Last: ${new Date(rule.lastExecuted).toLocaleDateString()}</span>` : ''}
        </div>
      </div>
      <div class="rule-actions">
        <button onclick="toggleRule('${rule._id}', ${!rule.isActive})" class="btn-toggle" title="${rule.isActive ? 'Pause' : 'Activate'}">
          <i class="fas ${rule.isActive ? 'fa-pause' : 'fa-play'}"></i>
        </button>
        <button onclick="deleteRule('${rule._id}')" class="btn-delete" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
        ruleList.appendChild(ruleItem);
    });
}

/**
 * Create a new rule
 */
async function handleRuleSubmit(e) {
    e.preventDefault();

    const ruleData = {
        name: document.getElementById('rule-name').value,
        description: document.getElementById('rule-description').value,
        trigger: {
            field: document.getElementById('trigger-field').value,
            operator: document.getElementById('trigger-operator').value,
            value: document.getElementById('trigger-value').value
        },
        actions: [{
            type: document.getElementById('action-type').value,
            value: document.getElementById('action-value').value
        }]
    };

    try {
        const response = await fetch('/api/rules', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(ruleData)
        });

        if (response.ok) {
            showNotification('Automation rule created!', 'success');
            ruleForm.reset();
            closeRuleModal();
            fetchRules();
        }
    } catch (error) {
        showNotification('Failed to create rule', 'error');
    }
}

/**
 * Toggle rule active status
 */
async function toggleRule(id, isActive) {
    try {
        await fetch(`/api/rules/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ isActive })
        });
        fetchRules();
    } catch (error) {
        console.error('Error toggling rule:', error);
    }
}

/**
 * Delete a rule
 */
async function deleteRule(id) {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
        await fetch(`/api/rules/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        showNotification('Rule deleted', 'info');
        fetchRules();
    } catch (error) {
        console.error('Error deleting rule:', error);
    }
}

// Modal management
function openRuleModal() {
    if (ruleModal) ruleModal.style.display = 'flex';
}

function closeRuleModal() {
    if (ruleModal) ruleModal.style.display = 'none';
}

// Event Listeners
if (ruleForm) ruleForm.addEventListener('submit', handleRuleSubmit);

// Global exposure
window.openRuleModal = openRuleModal;
window.closeRuleModal = closeRuleModal;
window.toggleRule = toggleRule;
window.deleteRule = deleteRule;

document.addEventListener('DOMContentLoaded', initSmartTriggers);
