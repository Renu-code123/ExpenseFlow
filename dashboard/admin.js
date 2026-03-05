// Admin Dashboard JS
fetch('/api/admin/users').then(r => r.json()).then(users => {
  document.getElementById('users').innerHTML = '<h2>Users</h2>' + users.map(u => `<div>${u.id}: ${u.role}</div>`).join('');
});
fetch('/api/admin/policies').then(r => r.json()).then(policies => {
  document.getElementById('policies').innerHTML = '<h2>Policies</h2>' + policies.map(p => `<div>${p.endpoint}: maxRisk=${p.maxRisk}</div>`).join('');
});
// ...more dashboard features...
