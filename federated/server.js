// Federated Learning Server
// Orchestrates rounds, aggregates models, manages clients

const net = require('net');
const crypto = require('./crypto');
const privacy = require('./privacy');
const model = require('./model');
const compliance = require('./compliance');
const config = require('./config');

class FederatedServer {
    constructor(options) {
        this.port = options.port || 9000;
        this.clients = new Map(); // clientId -> socket
        this.globalModel = model.createModel();
        this.round = 0;
        this.auditLog = [];
        this.server = net.createServer(this.handleConnection.bind(this));
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`Federated server listening on port ${this.port}`);
            compliance.log('Server started', { port: this.port });
        });
    }

    handleConnection(socket) {
        socket.on('data', (data) => this.handleClientMessage(socket, data));
        socket.on('end', () => this.handleClientDisconnect(socket));
        // Authentication handshake
        crypto.authenticateClient(socket, (clientId) => {
            this.clients.set(clientId, socket);
            compliance.log('Client connected', { clientId });
        });
    }

    handleClientMessage(socket, data) {
        // Decrypt and parse message
        let message;
        try {
            message = crypto.decryptMessage(data);
        } catch (e) {
            compliance.log('Decryption failed', { error: e.message });
            return;
        }
        // Handle message types: model update, request global model, etc.
        switch (message.type) {
            case 'modelUpdate':
                this.handleModelUpdate(socket, message);
                break;
            case 'requestGlobalModel':
                this.sendGlobalModel(socket);
                break;
            default:
                compliance.log('Unknown message type', { type: message.type });
        }
    }

    handleModelUpdate(socket, message) {
        // Apply privacy-preserving aggregation
        const clientModel = privacy.applyDifferentialPrivacy(message.model);
        this.aggregateModel(clientModel);
        compliance.log('Model update received', { clientId: message.clientId });
        // Optionally send updated global model back
        this.sendGlobalModel(socket);
    }

    aggregateModel(clientModel) {
        // Aggregate client model into global model
        this.globalModel = model.aggregate(this.globalModel, clientModel);
        this.round++;
        compliance.log('Model aggregated', { round: this.round });
    }

    sendGlobalModel(socket) {
        const encrypted = crypto.encryptMessage({
            type: 'globalModel',
            model: this.globalModel,
            round: this.round
        });
        socket.write(encrypted);
        compliance.log('Global model sent', {});
    }

    handleClientDisconnect(socket) {
        // Remove client from map
        for (const [clientId, s] of this.clients.entries()) {
            if (s === socket) {
                this.clients.delete(clientId);
                compliance.log('Client disconnected', { clientId });
                break;
            }
        }
    }
}

module.exports = FederatedServer;

// If run directly, start the server
if (require.main === module) {
    const server = new FederatedServer({ port: config.serverPort });
    server.start();
}
