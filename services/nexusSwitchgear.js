const TaxNexus = require('../models/TaxNexus');
const PolicyNode = require('../models/PolicyNode');
const GeofenceMath = require('../utils/geofenceMath');
const logger = require('../utils/structuredLogger');

/**
 * NexusSwitchgear Service
 * Issue #961: Routing logic for jurisdictional policy swaps.
 * Dynamically mounts the correct PolicyNode based on detected tax nexus.
 */
class NexusSwitchgear {
    constructor() {
        // In-memory cache of active nexuses to avoid repeated DB hits per request
        this._nexusCache = null;
        this._cacheExpiry = null;
        this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Detect applicable tax jurisdiction for a transaction.
     * @param {Object} transaction - { merchantCoord, merchantIp, currency, amount }
     * @returns {string|null} jurisdictionCode
     */
    async detectNexus(transaction) {
        const nexusList = await this._getCachedNexusList();
        let jurisdictionCode = null;

        // Priority 1: Geolocation match (merchant coordinates)
        if (transaction.merchantCoord) {
            jurisdictionCode = GeofenceMath.detectJurisdiction(transaction.merchantCoord, nexusList);
        }

        // Priority 2: IP-based fallback
        if (!jurisdictionCode && transaction.merchantIp) {
            jurisdictionCode = GeofenceMath.detectJurisdictionByIp(transaction.merchantIp, nexusList);
        }

        // Priority 3: Currency-based heuristic
        if (!jurisdictionCode && transaction.currency) {
            const match = nexusList.find(n =>
                n.nexusTriggers?.some(t => t.type === 'CURRENCY' && t.currencyCode === transaction.currency)
            );
            jurisdictionCode = match?.jurisdictionCode || null;
        }

        if (jurisdictionCode) {
            logger.info(`[NexusSwitchgear] Detected nexus: ${jurisdictionCode}`, {
                jurisdiction: jurisdictionCode, txAmount: transaction.amount
            });
        }

        return jurisdictionCode;
    }

    /**
     * Mount the correct PolicyNode for the detected jurisdiction.
     * Returns the matching PolicyNode document or null.
     * @param {string} jurisdictionCode
     * @returns {Object|null} PolicyNode
     */
    async mountPolicy(jurisdictionCode) {
        if (!jurisdictionCode) return null;

        const nexus = await TaxNexus.findOne({ jurisdictionCode, isActive: true })
            .populate('policyNodeId');

        if (!nexus?.policyNodeId) {
            logger.warn(`[NexusSwitchgear] No PolicyNode mapped for jurisdiction: ${jurisdictionCode}`);
            return null;
        }

        return nexus.policyNodeId;
    }

    /**
     * Full resolution: detect jurisdiction + mount appropriate policy.
     * Returns { jurisdictionCode, policy, taxRate }
     */
    async resolve(transaction) {
        const jurisdictionCode = await this.detectNexus(transaction);
        const policy = await this.mountPolicy(jurisdictionCode);
        const nexus = jurisdictionCode
            ? await TaxNexus.findOne({ jurisdictionCode, isActive: true })
            : null;

        return {
            jurisdictionCode,
            policy,
            taxType: nexus?.taxType || null,
            taxRate: nexus?.rate || 0,
            applied: !!jurisdictionCode
        };
    }

    async _getCachedNexusList() {
        if (this._nexusCache && this._cacheExpiry > Date.now()) {
            return this._nexusCache;
        }
        this._nexusCache = await TaxNexus.find({ isActive: true }).lean();
        this._cacheExpiry = Date.now() + this.CACHE_TTL_MS;
        return this._nexusCache;
    }

    /**
     * Invalidate the in-memory nexus cache (call after nexusUpdateJob runs).
     */
    invalidateCache() {
        this._nexusCache = null;
        this._cacheExpiry = null;
    }
}

module.exports = new NexusSwitchgear();
