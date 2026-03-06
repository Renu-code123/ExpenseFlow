// Federated Learning Client
// Handles local training, secure communication with server

const net = require('net');
const crypto = require('./crypto');
const privacy = require('./privacy');
const model = require('./model');
const compliance = require('./compliance');
const config = require('./config');

class FederatedClient {
    constructor(options) {
        this.serverHost = options.serverHost || 'localhost';
        this.serverPort = options.serverPort || 9000;
        this.clientId = options.clientId || crypto.generateClientId();
        this.localModel = model.createModel();
        this.socket = null;
        this.auditLog = [];
    }

    connect() {
        this.socket = net.createConnection({ host: this.serverHost, port: this.serverPort }, () => {
            compliance.log('Connected to server', { serverHost: this.serverHost, serverPort: this.serverPort });
            crypto.authenticateServer(this.socket, this.clientId);
        });
        this.socket.on('data', (data) => this.handleServerMessage(data));
        this.socket.on('end', () => compliance.log('Disconnected from server', {}));
    }

    handleServerMessage(data) {
        let message;
        try {
            message = crypto.decryptMessage(data);
        } catch (e) {
            compliance.log('Decryption failed', { error: e.message });
            return;
        }
        switch (message.type) {
            case 'globalModel':
                this.updateLocalModel(message.model);
                break;
            default:
                compliance.log('Unknown message type', { type: message.type });
        }
    }

    updateLocalModel(globalModel) {
        this.localModel = model.update(this.localModel, globalModel);
        compliance.log('Local model updated', {});
    }

    trainLocalModel(data) {
        // Train model on local data
        this.localModel = model.train(this.localModel, data);
        compliance.log('Local model trained', {});
    }

    sendModelUpdate() {
        // Apply privacy mechanisms
        const privateModel = privacy.applyDifferentialPrivacy(this.localModel);
        const encrypted = crypto.encryptMessage({
            type: 'modelUpdate',
            clientId: this.clientId,
            model: privateModel
        });
        this.socket.write(encrypted);
        compliance.log('Model update sent', {});
    }
}

module.exports = FederatedClient;

// If run directly, start the client
if (require.main === module) {
    const client = new FederatedClient({
        serverHost: config.serverHost,
        serverPort: config.serverPort,
        clientId: config.clientId
    });
    client.connect();
    // Example: train and send update
    // client.trainLocalModel(localData);
    // client.sendModelUpdate();
}
