const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Session = require('../models/Session');

/**
 * Auth Service
 * Issue #729: Centralized authentication logic with multi-tenant awareness.
 */
class AuthService {
    /**
     * Generates a JWT token with integrated tenant context
     */
    generateToken(user, selectedWorkspaceId = null) {
        const jwtId = crypto.randomBytes(16).toString('hex');

        const payload = {
            id: user._id,
            jti: jwtId,
            role: user.role,
            vaultAccess: true, // Issue #770: Decryption permissions
            benchmarkingEnabled: user.preferences?.allowBenchmarking || false // Issue #844
        };

        // If a specific workspace is selected, embed it in the token
        if (selectedWorkspaceId) {
            payload.activeWorkspace = selectedWorkspaceId;
        }

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '24h' }
        );

        return { token, jwtId };
    }

    /**
     * Creates a new session linked to a tenant if applicable
     */
    async createSession(user, jwtId, req, options = {}) {
        return Session.createSession(user._id, jwtId, req, {
            ...options,
            workspaceId: options.workspaceId || null
        });
    }
}

module.exports = new AuthService();
