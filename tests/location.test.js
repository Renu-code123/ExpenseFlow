/**
 * Location Intelligence Test Suite
 * Issue #635
 */

const assert = require('assert');
const geoUtils = require('../utils/geoUtils');
const locationService = require('../services/locationService');

describe('Smart Location Intelligence', () => {

    describe('Geo Utils', () => {
        it('should calculate distance correctly between NY and LA (~3940km)', () => {
            const distance = geoUtils.calculateDistance(40.7128, -74.0060, 34.0522, -118.2437);
            assert(distance > 3900 && distance < 4000);
        });

        it('should create a valid GeoJSON point', () => {
            const point = geoUtils.toPoint(-74.0060, 40.7128);
            assert.strictEqual(point.type, 'Point');
            assert.strictEqual(point.coordinates[0], -74.0060);
        });

        it('should validate locations correctly', () => {
            assert(geoUtils.isValidLocation({ type: 'Point', coordinates: [-74, 40] }));
            assert(!geoUtils.isValidLocation({ type: 'Point', coordinates: [0, 0] }));
        });
    });

    describe('Location Service Logic', () => {
        it('should have a findNear method', () => {
            assert.strictEqual(typeof locationService.findNear, 'function');
        });

        it('should have a geocodeTransaction method', () => {
            assert.strictEqual(typeof locationService.geocodeTransaction, 'function');
        });

        it('should mock geocode recognized merchants', async () => {
            // Testing the private _mockExternalGeocode logic
            const place = await locationService._mockExternalGeocode('Starbucks');
            assert.ok(place);
            assert.strictEqual(place.name, 'Starbucks');
            assert.strictEqual(place.location.coordinates[1], 40.7128);
        });
    });
});
