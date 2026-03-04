# Master Key Generation & Secure Storage Module

## Issue #921 Implementation

This module provides a secure master key lifecycle system for AES-256 master keys with enterprise-grade security features.

## Features

- **CSPRNG-based Key Generation**: Uses `crypto.randomBytes()` for cryptographically secure entropy
- **Multiple Storage Backends**: Vault, HSM, KMS, and local encrypted storage abstraction
- **Key Wrapping**: Secure key wrapping and unwrapping for transport and storage
- **Access Policy Enforcement**: Role-based and service account-based access control
- **Automatic Rotation**: Scheduled key rotation with configurable intervals
- **In-memory Zeroization**: Secure cleanup of sensitive data from memory
- **Audit Trail**: Comprehensive logging of all key operations

## Architecture

### MasterKey Model
- Stores encrypted key material (never plaintext)
- Key wrapping information for secure storage
- Access policies and compliance metadata
- Audit trail for all operations

### Storage Backend Adapters
- **LocalEncryptedStorageAdapter**: File-based encrypted storage
- **VaultStorageAdapter**: HashiCorp Vault integration
- **InMemoryStorageAdapter**: Testing and development

### MasterKeyService
- Key generation and lifecycle management
- Storage abstraction layer
- Access control enforcement
- Automatic rotation scheduling

## Usage

### Basic Key Generation

```javascript
const MasterKeyService = require('./services/masterKeyService');
const masterKeyService = new MasterKeyService();

// Create a new master key
const keyInfo = await masterKeyService.createMasterKey('encryption', {
    actor: { userId: 'admin', role: 'administrator' },
    backend: 'vault', // or 'local-encrypted', 'hsm', etc.
    accessPolicy: {
        allowedRoles: ['admin', 'service'],
        requireMFA: true
    }
});

console.log(`Created master key: ${keyInfo.keyId}`);
```

### Key Retrieval

```javascript
// Retrieve a master key
const masterKey = await masterKeyService.retrieveMasterKey('mk-encryption-123', {
    userId: 'service-account',
    serviceAccount: 'encryption-service',
    role: 'service'
});

// Use the key for encryption operations
// Remember to zeroize after use
masterKeyService.zeroizeBuffer(masterKey);
```

### Key Rotation

```javascript
// Rotate a master key
const rotationResult = await masterKeyService.rotateMasterKey('mk-encryption-123', {
    userId: 'admin',
    role: 'administrator',
    mfaVerified: true
});

console.log(`Rotated to version: ${rotationResult.version}`);
```

### Key Management

```javascript
// List all master keys
const keys = await masterKeyService.listMasterKeys({ status: 'active' });

// Get key information
const keyInfo = await masterKeyService.getMasterKeyInfo('mk-encryption-123');
```

## Configuration

### Environment Variables

```bash
# Storage backend configuration
MASTER_KEY_STORAGE_BACKEND=local-encrypted  # or vault, hsm, kms

# Local encrypted storage
MASTER_KEY_ENCRYPTION_KEY=your-secure-key-here

# Vault configuration
VAULT_URL=https://vault.example.com:8200
VAULT_TOKEN=your-vault-token
VAULT_MOUNT_PATH=secret
VAULT_PATH=master-keys

# HSM configuration
HSM_ENABLED=true
HSM_MODULE_PATH=/usr/lib/hsm.so
HSM_SLOT_ID=0
HSM_PIN=your-hsm-pin
```

### Access Policies

```javascript
const accessPolicy = {
    allowedRoles: ['admin', 'auditor'],
    allowedServiceAccounts: ['encryption-service', 'backup-service'],
    allowedOperations: ['generate', 'retrieve', 'rotate', 'revoke'],
    requireMFA: true,
    maxAccessFrequency: 100  // accesses per hour
};
```

## Security Considerations

### Key Material Protection
- Master keys are never stored or logged in plaintext
- All key material is encrypted at rest using AES-256-GCM
- In-memory buffers are zeroized after use

### Access Control
- Role-based access control (RBAC)
- Service account authentication
- Multi-factor authentication requirements
- Operation-specific permissions

### Audit and Compliance
- All key operations are logged
- FIPS 140-2 compliance support
- PCI DSS and HIPAA compliance flags
- GDPR compliance for EU deployments

### Key Rotation
- Automatic rotation based on schedule
- Manual rotation capabilities
- Version management for backward compatibility
- Secure key transition during rotation

## Testing

Run the unit tests:

```bash
npm test -- tests/masterKeyService.test.js
```

Tests cover:
- CSPRNG key generation
- Key wrapping/unwrapping
- Access policy enforcement
- Storage backend abstraction
- Security features (zeroization, encryption at rest)

## Integration with Existing Systems

The Master Key Service integrates with the existing `KeyDerivation` utility:

```javascript
// KeyDerivation now attempts to use MasterKeyService first
const masterKey = KeyDerivation.getMasterKey(); // Uses MasterKeyService if available

// Derive tenant-specific keys
const tenantKey = KeyDerivation.deriveTenantKey(masterKey, tenantId);
```

## Future Enhancements

- Hardware Security Module (HSM) integration
- Key Management Interoperability Protocol (KMIP) support
- Cloud KMS integrations (AWS KMS, Azure Key Vault, GCP KMS)
- Quantum-resistant key algorithms
- Distributed key management for multi-region deployments