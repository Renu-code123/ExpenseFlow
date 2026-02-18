const Transaction = require('../models/Transaction');
const Place = require('../models/Place');
const geoUtils = require('../utils/geoUtils');

/**
 * Location Service
 * Orchestrates geocoding, proximity search, and location intelligence
 * Issue #635
 */
class LocationService {
    /**
     * Geocode a transaction based on its merchant or description
     */
    async geocodeTransaction(transactionId) {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) throw new Error('Transaction not found');

        // Search in local cache first
        let place = await Place.findOne({
            $or: [
                { name: new RegExp(transaction.merchant, 'i') },
                { name: new RegExp(transaction.description, 'i') }
            ]
        });

        if (!place && transaction.merchant) {
            // Mock external geocoding (e.g. Google Maps API)
            place = await this._mockExternalGeocode(transaction.merchant);
        }

        if (place) {
            transaction.location = place.location;
            transaction.formattedAddress = place.formattedAddress;
            transaction.locationSource = 'geocoded';
            transaction.place = place._id;
            await transaction.save();
            return { transactionId, success: true, method: 'geocoded', place: place.name };
        }

        return { transactionId, success: false, reason: 'No location match found' };
    }

    /**
     * Find transactions near a specific coordinate
     */
    async findNear(userId, lng, lat, radiusMeters = 5000) {
        return await Transaction.find({
            user: userId,
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: radiusMeters
                }
            }
        }).populate('place');
    }

    /**
     * Identify "Spending Hotspots" by clustering nearby transactions
     */
    async getSpendingClusters(userId, radiusKm = 1) {
        const transactions = await Transaction.find({
            user: userId,
            'location.coordinates': { $ne: [0, 0] }
        });

        const clusters = [];
        const visited = new Set();

        for (const tx of transactions) {
            if (visited.has(tx._id.toString())) continue;

            const cluster = [tx];
            visited.add(tx._id.toString());

            for (const otherTx of transactions) {
                if (visited.has(otherTx._id.toString())) continue;

                const distance = geoUtils.calculateDistance(
                    tx.location.coordinates[1], tx.location.coordinates[0],
                    otherTx.location.coordinates[1], otherTx.location.coordinates[0]
                );

                if (distance <= radiusKm) {
                    cluster.push(otherTx);
                    visited.add(otherTx._id.toString());
                }
            }

            if (cluster.length >= 2) {
                clusters.push({
                    center: tx.location,
                    count: cluster.length,
                    totalAmount: cluster.reduce((sum, t) => sum + t.amount, 0),
                    transactions: cluster.map(t => t._id)
                });
            }
        }

        return clusters.sort((a, b) => b.totalAmount - a.totalAmount);
    }

    /**
     * Mock External Geocoding Tool
     * Simulates Google Places API results for common merchants
     */
    async _mockExternalGeocode(merchantName) {
        const mocks = {
            'starbucks': { lat: 40.7128, lng: -74.0060, address: 'Starbucks, Lower Manhattan, NY' },
            'walmart': { lat: 34.0522, lng: -118.2437, address: 'Walmart, Los Angeles, CA' },
            'mcdonalds': { lat: 41.8781, lng: -87.6298, address: 'McDonalds, Chicago, IL' },
            'uber': { lat: 37.7749, lng: -122.4194, address: 'Uber HQ, San Francisco, CA' }
        };

        const key = merchantName.toLowerCase().split(' ')[0];
        const data = mocks[key];

        if (data) {
            let place = await Place.findOne({ name: merchantName });
            if (!place) {
                place = new Place({
                    name: merchantName,
                    formattedAddress: data.address,
                    location: {
                        type: 'Point',
                        coordinates: [data.lng, data.lat]
                    }
                });
                await place.save();
            }
            return place;
        }
        return null;
    }
}

module.exports = new LocationService();
