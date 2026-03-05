/**
 * Compliance Center & Forensic Audit Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    loadComplianceDashboard();
    loadJurisdictionalRules();
    setupAuditForm();
});

async function loadComplianceDashboard() {
    try {
        const res = await fetch('/api/compliance/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderAuditPacks(data.auditPacks);
        updateComplianceScore(data.complianceScore);
    } catch (err) {
        console.error('Failed to load compliance dashboard:', err);
    }
}

function renderAuditPacks(packs) {
    const list = document.getElementById('audit-packs-list');
    if (!packs || packs.length === 0) {
        list.innerHTML = '<div class="empty-state">No audits generated yet.</div>';
        return;
    }

    list.innerHTML = packs.map(pack => `
        <div class="pack-item glass-card">
            <div class="pack-meta">
                <strong>${pack.auditId}</strong>
                <span>${new Date(pack.period.start).toLocaleDateString()} - ${new Date(pack.period.end).toLocaleDateString()}</span>
            </div>
            <div class="pack-stats">
                <span class="badgered">${pack.statistics.forensicFindings} Flags</span>
                <i class="fas fa-file-pdf action-icon"></i>
            </div>
        </div>
    `).join('');
}

function updateComplianceScore(score) {
    const text = document.querySelector('.percentage');
    if (text) text.textContent = `${score}%`;
    const circle = document.querySelector('.circle');
    if (circle) {
        const offset = (score / 100) * 100;
        circle.setAttribute('stroke-dasharray', `${offset}, 100`);
    }
}

async function loadJurisdictionalRules() {
    try {
        const res = await fetch('/api/compliance/rules', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        const summary = document.getElementById('rules-summary');
        const grouped = data.reduce((acc, rule) => {
            acc[rule.jurisdiction] = (acc[rule.jurisdiction] || []).length + 1;
            return acc;
        }, {});

        summary.innerHTML = Object.entries(grouped).map(([juris, count]) => `
            <div class="juris-item">
                <span class="flag-icon"><i class="fas fa-flag"></i></span>
                <div class="juris-meta">
                    <strong>${juris}</strong>
                    <small>${count} Active Rules</small>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load rules:', err);
    }
}

function openAuditModal() {
    document.getElementById('audit-modal').classList.remove('hidden');
}

function closeAuditModal() {
    document.getElementById('audit-modal').classList.add('hidden');
}

function setupAuditForm() {
    const form = document.getElementById('audit-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const start = document.getElementById('audit-start').value;
        const end = document.getElementById('audit-end').value;

        try {
            const btn = form.querySelector('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            btn.disabled = true;

            const res = await fetch('/api/compliance/generate-audit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ start, end })
            });

            if (res.ok) {
                closeAuditModal();
                loadComplianceDashboard();
            }
        } catch (err) {
            console.error('Audit generation failed:', err);
        } finally {
            const btn = form.querySelector('button');
            btn.innerHTML = 'Initialize Forensic Audit';
            btn.disabled = false;
        }
    });
}
