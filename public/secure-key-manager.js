// secure-key-manager.js
// Key management and access control for homomorphic encryption
import { generatePaillierKeyPair } from './homomorphic-crypto.js';

class SecureKeyManager {
  constructor() {
    this.keyPair = generatePaillierKeyPair();
    this.authorizedUsers = new Set();
  }

  authorizeUser(userId) {
    this.authorizedUsers.add(userId);
  }

  revokeUser(userId) {
    this.authorizedUsers.delete(userId);
  }

  isAuthorized(userId) {
    return this.authorizedUsers.has(userId);
  }

  getPublicKey() {
    return this.keyPair.publicKey;
  }

  getPrivateKey() {
    return this.keyPair.privateKey;
  }
}

export { SecureKeyManager };
