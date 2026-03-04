/**
 * Controller for Tag Management and Intelligent Categorization
 */

const API_BASE = '/api/tags';
let tagChart = null;

document.addEventListener('DOMContentLoaded', () => {
    loadTags();
    loadRules();
    loadSuggestions();
    loadAnalytics();

    // Modal controls
    const tagModal = document.getElementById('tag-modal');
    const addTagBtn = document.getElementById('add-tag-btn');
    const closeBtn = document.querySelector('.close-modal');
    const tagForm = document.getElementById('tag-form');

    addTagBtn.onclick = () => {
        document.getElementById('tag-modal-title').textContent = 'Create New Tag';
        tagForm.reset();
        tagModal.classList.remove('hidden');
    };

    closeBtn.onclick = () => tagModal.classList.add('hidden');

    tagForm.onsubmit = async (e) => {
        e.preventDefault();
        const tagData = {
            name: document.getElementById('tag-name').value,
            color: document.getElementById('tag-color').value,
            icon: document.getElementById('tag-icon').value
        };

        try {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(tagData)
            });
            const data = await res.json();
            if (data.success) {
                tagModal.classList.add('hidden');
                loadTags();
                loadAnalytics();
            }
        } catch (err) {
            console.error('Error saving tag:', err);
        }
    };
});

async function loadTags() {
    try {
        const res = await fetch(API_BASE, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            const container = document.getElementById('tags-list');
            document.getElementById('total-tags-count').textContent = data.data.length;

            if (data.data.length === 0) {
                container.innerHTML = '<div class="placeholder">No tags found.</div>';
                return;
            }

            container.innerHTML = data.data.map(tag => `
        <div class="tag-row">
          <div class="tag-info">
            <span class="tag-chip" style="background-color: ${tag.color || '#64ffda'}">
              ${renderIcon(tag.icon)} ${tag.name}
            </span>
          </div>
          <div class="tag-meta">
            <span class="usage-badge">${tag.usageCount || 0} uses</span>
            <button class="btn-icon" onclick="deleteTag('${tag._id}')">🗑️</button>
          </div>
        </div>
      `).join('');
        }
    } catch (err) {
        console.error('Error loading tags:', err);
    }
}

async function loadRules() {
    try {
        const res = await fetch(`${API_BASE}/rules`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            const container = document.getElementById('rules-list');
            document.getElementById('total-rules-count').textContent = data.data.length;

            if (data.data.length === 0) {
                container.innerHTML = '<div class="placeholder">No rules defined.</div>';
                return;
            }

            container.innerHTML = data.data.map(rule => `
        <div class="tag-row rule-card">
          <div class="rule-info">
            <strong>${rule.pattern}</strong> 
            <span class="badge">${rule.isRegex ? 'Regex' : 'Keyword'}</span>
            <span class="arrow">→</span>
            <span class="category-pill">${rule.suggestedCategory}</span>
          </div>
          <div class="rule-stats">
            <span class="confidence-high">${(rule.confidenceScore * 100).toFixed(0)}% confidence</span>
            <span class="match-count">${rule.matchCount || 0} matches</span>
          </div>
        </div>
      `).join('');
        }
    } catch (err) {
        console.error('Error loading rules:', err);
    }
}

async function loadSuggestions() {
    try {
        const res = await fetch(`${API_BASE}/suggestions`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            const container = document.getElementById('suggestions-list');

            if (data.data.length === 0) {
                container.innerHTML = '<div class="placeholder">No new patterns identified.</div>';
                return;
            }

            container.innerHTML = data.data.map(s => `
        <div class="suggestion-item glass-card" style="margin-bottom: 10px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600;">"${s.merchant}"</div>
              <div style="font-size: 0.8rem; opacity: 0.7;">Seen ${s.count} times as <span class="category-pill">${s.category}</span></div>
            </div>
            <button class="btn-sm" onclick="acceptSuggestion('${s.merchant}', '${s.category}')">Apply</button>
          </div>
        </div>
      `).join('');
        }
    } catch (err) {
        console.error('Error loading suggestions:', err);
    }
}

async function loadAnalytics() {
    try {
        const res = await fetch(`${API_BASE}/analytics`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (data.success) {
            updateChart(data.data.distribution);
        }
    } catch (err) {
        console.error('Error loading analytics:', err);
    }
}

function updateChart(data) {
    const ctx = document.getElementById('tag-usage-chart').getContext('2d');

    if (tagChart) tagChart.destroy();

    const labels = data.map(d => d.name);
    const counts = data.map(d => d.usage);
    const colors = data.map(d => d.color || '#64ffda');

    tagChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tag Usage Content',
                data: counts,
                backgroundColor: colors.map(c => c + '80'),
                borderColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#fff' } },
                x: { ticks: { color: '#fff' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderIcon(icon) {
    const icons = {
        tag: '🏷️',
        shopping: '🛍️',
        food: '🍴',
        transport: '🚗',
        entertainment: '🎮',
        utilities: '💡'
    };
    return icons[icon] || '🏷️';
}

async function deleteTag(id) {
    if (!confirm('Are you sure you want to delete this tag? It will be removed from all transactions.')) return;
    try {
        await fetch(`${API_BASE}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        loadTags();
        loadAnalytics();
    } catch (err) {
        console.error('Error deleting tag:', err);
    }
}

async function acceptSuggestion(merchant, category) {
    try {
        await fetch(`${API_BASE}/rules`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                pattern: merchant,
                suggestedCategory: category,
                fieldToMatch: 'merchant',
                isRegex: false,
                confidenceScore: 0.9,
                priority: 5
            })
        });
        loadRules();
        loadSuggestions();
    } catch (err) {
        console.error('Error accepting suggestion:', err);
    }
}
