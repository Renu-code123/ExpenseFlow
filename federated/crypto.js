// Secure Communication Utilities
// Encryption, authentication, key management

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let serverKey = crypto.randomBytes(KEY_LENGTH);
let clientKeys = new Map(); // clientId -> key

function generateClientId() {
    return crypto.randomBytes(8).toString('hex');
}

function generateKey() {
    return crypto.randomBytes(KEY_LENGTH);
}

function encryptMessage(message, key = serverKey) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(JSON.stringify(message), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
}

function decryptMessage(buffer, key = serverKey) {
    const iv = buffer.slice(0, IV_LENGTH);
    const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
}

function authenticateClient(socket, callback) {
    // Simple handshake: client sends ID, server stores key
    socket.once('data', (data) => {
        const clientId = data.toString('utf8');
        const key = generateKey();
        clientKeys.set(clientId, key);
        socket.write(key);
        callback(clientId);
    });
}

function authenticateServer(socket, clientId) {
    // Client sends ID, receives key
    socket.write(clientId);
    socket.once('data', (data) => {
        // Store received key for future communication
        clientKeys.set(clientId, data);
    });
}

module.exports = {
    generateClientId,
    generateKey,
    encryptMessage,
    decryptMessage,
    authenticateClient,
    authenticateServer,
    clientKeys,
    serverKey
};
