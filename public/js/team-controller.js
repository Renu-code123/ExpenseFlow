/**
 * Controller for Team Management and Hierarchy
 */

const API_TEAMS = '/api/teams';

document.addEventListener('DOMContentLoaded', () => {
    loadTeams();
});

async function loadTeams() {
    const grid = document.getElementById('teams-grid');
    try {
        const res = await fetch(`${API_TEAMS}/my-teams`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();

        if (data.success && data.data.length > 0) {
            grid.innerHTML = data.data.map(team => `
                <div class="team-card glass-card">
                    <div class="team-header">
                        <h3>${team.name}</h3>
                        <span class="dept-badge">${team.department}</span>
                    </div>
                    <div class="team-meta">
                        <p><i class="fas fa-user-tie"></i> Manager: ${team.manager.name}</p>
                        <p><i class="fas fa-users"></i> Members: ${team.members.length}</p>
                        <p><i class="fas fa-shield-alt"></i> Limit: ₹${team.approvalLimit.toLocaleString()}</p>
                    </div>
                    <div class="team-actions">
                        <button class="btn-outline-sm" onclick="manageMembers('${team._id}')">Manage</button>
                    </div>
                </div>
            `).join('');
        } else {
            grid.innerHTML = '<div class="empty-state">No teams found. Create your first team structure!</div>';
        }
    } catch (err) {
        console.error('Error loading teams:', err);
    }
}

function showCreateTeamModal() {
    document.getElementById('team-modal').classList.remove('hidden');
}

document.querySelector('.close-modal').onclick = () => {
    document.getElementById('team-modal').classList.add('hidden');
};

document.getElementById('team-form').onsubmit = async (e) => {
    e.preventDefault();
    const teamData = {
        name: document.getElementById('team-name').value,
        department: document.getElementById('team-department').value,
        approvalLimit: parseFloat(document.getElementById('team-limit').value)
    };

    try {
        const res = await fetch(API_TEAMS, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(teamData)
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('team-modal').classList.add('hidden');
            loadTeams();
        }
    } catch (err) {
        console.error('Error creating team:', err);
    }
};

function showCreateWorkflowModal() {
    alert('Workflow designer coming soon! Using standard multi-level templates.');
}
