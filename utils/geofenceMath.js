/**
 * Geofence Math Utility
 * Issue #961: Geometric logic for mapping IPs/Merchant-locations to tax grids.
 */
class GeofenceMath {
    /**
     * Point-in-Polygon test using Ray Casting algorithm.
     * @param {[number, number]} point - [longitude, latitude]
     * @param {[number, number][][]} polygonCoords - GeoJSON Polygon coordinates
     * @returns {boolean}
     */
    static pointInPolygon(point, polygonCoords) {
        const [px, py] = point;
        const polygon = polygonCoords[0]; // Outer ring
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];

            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    }

    /**
     * Checks if an IP falls within a given CIDR range.
     * @param {string} ip - e.g., '203.0.113.42'
     * @param {string} cidr - e.g., '203.0.113.0/24'
     * @returns {boolean}
     */
    static ipInCidr(ip, cidr) {
        const [range, bits] = cidr.split('/');
        const mask = ~(2 ** (32 - parseInt(bits)) - 1);

        const ipInt = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0);
        const rangeInt = range.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0);

        return (ipInt & mask) === (rangeInt & mask);
    }

    /**
     * Returns the best matching jurisdiction code for a given coordinate point.
     * @param {[number, number]} merchantCoord - [lng, lat]
     * @param {Array} nexusList - Array of TaxNexus documents
     * @returns {string|null} jurisdictionCode
     */
    static detectJurisdiction(merchantCoord, nexusList) {
        for (const nexus of nexusList) {
            if (nexus.geoBoundary?.coordinates?.length) {
                if (this.pointInPolygon(merchantCoord, nexus.geoBoundary.coordinates)) {
                    return nexus.jurisdictionCode;
                }
            }
        }
        return null;
    }

    /**
     * Returns jurisdiction by IP address against all known CIDR ranges.
     * @param {string} ip
     * @param {Array} nexusList
     * @returns {string|null}
     */
    static detectJurisdictionByIp(ip, nexusList) {
        for (const nexus of nexusList) {
            for (const cidr of (nexus.ipCidrRanges || [])) {
                if (this.ipInCidr(ip, cidr)) return nexus.jurisdictionCode;
            }
        }
        return null;
    }
}

module.exports = GeofenceMath;
