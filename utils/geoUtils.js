/**
 * Geo Utils
 * Helper functions for geospatial arithmetic and GeoJSON handling
 * Issue #635
 */

class GeoUtils {
    /**
     * Calculate distance between two points in km (Haversine formula)
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the earth in km
        const dLat = this._deg2rad(lat2 - lat1);
        const dLon = this._deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._deg2rad(lat1)) * Math.cos(this._deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d;
    }

    /**
     * Convert meters to radians (standard for MongoDB $centerSphere)
     */
    metersToRadians(meters) {
        return meters / 6371000;
    }

    /**
     * Create a standard GeoJSON Point object
     */
    toPoint(lng, lat) {
        return {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
        };
    }

    /**
     * Basic GeoJSON validation
     */
    isValidLocation(location) {
        return (
            location &&
            location.type === 'Point' &&
            Array.isArray(location.coordinates) &&
            location.coordinates.length === 2 &&
            !isNaN(location.coordinates[0]) &&
            !isNaN(location.coordinates[1]) &&
            location.coordinates[0] !== 0 && // Filter out default [0,0] if used as placeholder
            location.coordinates[1] !== 0
        );
    }

    _deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
}

module.exports = new GeoUtils();
