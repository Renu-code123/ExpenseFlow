/**
 * Reconciliation Controller
 * Handles IC transactions, matching reports, and settlement advising.
 */

let entities = [];

document.addEventListener('DOMContentLoaded', () => {
    initRecon();
});

async function initRecon() {
    await loadEntities();
    await loadHistory();
    await loadBalances();
}

async function loadEntities() {
    try {
        const response = await fetch('/api/workspaces', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        entities = await response.json();

        const sourceSelect = document.getElementById('source-entity');
        const targetSelect = document.getElementById('target-entity');

        const options = entities.map(e => `<option value="${e._id}">${e.name}</option>`).join('');
        sourceSelect.innerHTML = options;
        targetSelect.innerHTML = options;
    } catch (err) {
        console.error('Error loading entities:', err);
    }
}

async function loadHistory() {
    try {
        const statusFilter = document.getElementById('status-filter').value;
        const response = await fetch('/api/reconciliation/history', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const history = await response.json();

        const tbody = document.getElementById('intercompany-tbody');
        tbody.innerHTML = history
            .filter(t => statusFilter === 'All' || t.status === statusFilter)
            .map(t => `
            <tr>
                <td>${new Date(t.transactionDate).toLocaleDateString()}</td>
                <td><small>${t.referenceNumber || t._id.substring(0, 8)}</small></td>
                <td>${t.sourceEntityId?.name}</td>
                <td>${t.targetEntityId?.name}</td>
                <td>₹${t.amount.toLocaleString()}</td>
                <td><span class="type-tag">${t.type}</span></td>
                <td><span class="badge ${t.status.toLowerCase()}">${t.status}</span></td>
                <td>
                    ${t.status !== 'Settled' ? `<button onclick="settleTxn('${t._id}')" class="btn-sm btn-secondary">Force Settle</button>` : '-'}
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading history:', err);
    }
}

async function loadBalances() {
    const grid = document.getElementById('balance-grid');
    grid.innerHTML = '';

    // Logic: Matrix of active entities
    if (entities.length < 2) {
        grid.innerHTML = '<div class="alert">At least two workspaces are required for reconciliation.</div>';
        return;
    }

    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            const eA = entities[i];
            const eB = entities[j];

            try {
                const response = await fetch(`/api/reconciliation/balance?entityA=${eA._id}&entityB=${eB._id}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                const balance = await response.json();

                const div = document.createElement('div');
                div.className = 'balance-card glass-card-sm';
                div.innerHTML = `
                    <div class="pair-names"><strong>${eA.name}</strong> ↔ <strong>${eB.name}</strong></div>
                    <div class="net-value ${balance.netOwed > 0 ? 'pos' : 'neg'}">
                        ₹${Math.abs(balance.netOwed).toLocaleString()}
                        <span>${balance.netOwed > 0 ? `${eB.name} owes ${eA.name}` : `${eA.name} owes ${eB.name}`}</span>
                    </div>
                    <button class="btn-sm btn-primary" onclick="getAdvice('${eA._id}', '${eB._id}')">Review Settlement</button>
                `;
                grid.appendChild(div);
            } catch (err) {
                console.error('Error fetching balance:', err);
            }
        }
    }
}

async function getAdvice(eA, eB) {
    const advisor = document.getElementById('settlement-advisor-content');
    advisor.innerHTML = '<div class="spinner">Analyzing ledgers...</div>';

    try {
        const response = await fetch(`/api/reconciliation/settlement-advice?entityA=${eA}&entityB=${eB}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const advice = await response.json();

        advisor.innerHTML = `
            <div class="advice-box">
                <div class="advice-summary">
                    <label>Net Settlement Required</label>
                    <h2 class="${advice.summary.netPayable < 0 ? 'text-red' : 'text-green'}">
                        ₹${Math.abs(advice.summary.netPayable).toLocaleString()}
                    </h2>
                </div>
                <div class="advice-details">
                    <div>Outbound: ₹${advice.summary.totalOutbound.toLocaleString()}</div>
                    <div>Inbound: ₹${advice.summary.totalInbound.toLocaleString()}</div>
                </div>
                <button class="btn-primary full-width mt-10" onclick="performBulkSettlement('${advice.eligibleTransactions.join(',')}')">
                    Execute Settlement
                </button>
            </div>
        `;
    } catch (err) {
        console.error('Error getting advice:', err);
    }
}

async function performBulkSettlement(ids) {
    if (!confirm('Confirm bulk settlement of all selected transactions?')) return;

    try {
        const response = await fetch('/api/reconciliation/settle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ txnIds: ids.split(',') })
        });

        if (response.ok) {
            alert('Intercompany settlement processed successfully.');
            initRecon();
        }
    } catch (err) {
        console.error('Error settling:', err);
    }
}

function openTxnModal() { document.getElementById('txn-modal').style.display = 'block'; }
function closeTxnModal() { document.getElementById('txn-modal').style.display = 'none'; }

document.getElementById('recon-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        sourceEntityId: document.getElementById('source-entity').value,
        targetEntityId: document.getElementById('target-entity').value,
        amount: Number(document.getElementById('flow-amount').value),
        type: document.getElementById('flow-type').value,
        description: document.getElementById('flow-desc').value
    };

    if (data.sourceEntityId === data.targetEntityId) {
        alert('Source and target entities cannot be the same.');
        return;
    }

    try {
        const response = await fetch('/api/reconciliation/transaction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeTxnModal();
            initRecon();
        }
    } catch (err) {
        console.error('Error posting txn:', err);
    }
});
