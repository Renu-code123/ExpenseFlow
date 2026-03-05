/**
 * MFA Enforcer Middleware
 * Issue #770: Granting key-access only to TOTP-verified sessions.
 * Blocks decryption requests if the session hasn't been MFA verified.
 */
const mfaEnforcer = (req, res, next) => {
    // Check if session has been MFA verified
    // We check both session flag and user field for redundancy
    const isMfaVerified = req.session?.verified2FA || req.user?.verified2FA || req.session?.vaultGrant;

    if (!isMfaVerified) {
        return res.status(403).json({
            error: 'Sensitive data access restricted. Multi-Factor Authentication (MFA) required.',
            code: 'MFA_REQUIRED',
            requiresMfa: true
        });
    }

    next();
};

module.exports = mfaEnforcer;
