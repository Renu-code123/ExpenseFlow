// collab-budget-server.js
// Node.js WebSocket server for collaborative budget editing
wss.on('connection', ws => {
const WebSocket = require('ws');
const Automerge = require('automerge');

const wss = new WebSocket.Server({ port: 8080 });
let doc = Automerge.init();
let clients = [];
let users = [];

function broadcast(type, payload, exceptWs = null) {
  clients.forEach(client => {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, ...payload }));
    }
  });
}

wss.on('connection', ws => {
  clients.push(ws);
  ws.send(JSON.stringify({ type: 'init', doc: Automerge.save(doc) }));

  ws.on('message', message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }
    if (data.type === 'changes') {
      const changes = data.changes;
      doc = Automerge.applyChanges(doc, changes);
      broadcast('changes', { changes }, ws);
    } else if (data.type === 'user-join') {
      if (!users.includes(data.userId)) {
        users.push(data.userId);
        broadcast('user-join', { users });
      }
      ws.send(JSON.stringify({ type: 'user-join', users }));
    }
  });

  ws.on('close', () => {
    clients = clients.filter(client => client !== ws);
    // Remove user if possible
    // (In a real app, track ws <-> userId mapping)
  });
});

setInterval(() => {
  // Periodic broadcast for presence and doc sync
  broadcast('user-join', { users });
  broadcast('changes', { changes: Automerge.getAllChanges(doc) });
}, 10000);

console.log('Collaborative budget server running on ws://localhost:8080');
