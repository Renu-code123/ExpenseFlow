// secure-analytics-engine.js
// Analytics engine for encrypted data using homomorphic encryption
import { PaillierKeyPair, generatePaillierKeyPair } from './homomorphic-crypto.js';

class SecureAnalyticsEngine {
  constructor() {
    this.keyPair = generatePaillierKeyPair();
    this.encryptedData = [];
    this.rawData = [];
  }

  ingest(value) {
    const encrypted = this.keyPair.publicKey.encrypt(value);
    this.encryptedData.push(encrypted);
    this.rawData.push(value);
  }

  encryptedSum() {
    let sum = 1;
    for (const c of this.encryptedData) {
      sum = this.keyPair.publicKey.add(sum, c);
    }
    return sum;
  }

  encryptedAverage() {
    if (this.encryptedData.length === 0) return null;
    const sum = this.encryptedSum();
    // Decrypt sum and divide
    const decryptedSum = this.keyPair.privateKey.decrypt(sum);
    return decryptedSum / this.encryptedData.length;
  }

  getRawSum() {
    return this.rawData.reduce((a, b) => a + b, 0);
  }

  getRawAverage() {
    if (this.rawData.length === 0) return null;
    return this.getRawSum() / this.rawData.length;
  }

  getEncryptedData() {
    return this.encryptedData;
  }

  getRawData() {
    return this.rawData;
  }
}

export { SecureAnalyticsEngine };
