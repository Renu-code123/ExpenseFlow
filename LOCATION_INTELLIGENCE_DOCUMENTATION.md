# Smart Location Intelligence & Geospatial Analytics

## 🚀 Overview
Issue #635 introduces geospatial awareness to the ExpenseFlow platform. This allows transactions to be geocoded, enabling map visualizations, proximity-based searches, and physical spending hotspot analysis.

## 🏗️ Technical Architecture

### 1. Geospatial Data Model (`models/Transaction.js`)
Transactions now store location data using the standard GeoJSON format:
- `location`: `{ type: "Point", coordinates: [lng, lat] }`
- `formattedAddress`: A human-readable address.
- `locationSource`: Tracking how the location was derived (`manual`, `geocoded`, `inferred`).

### 2. Location Cache (`models/Place.js`)
To optimize performance and minimize external API costs, we cache geocoded results in the `Place` collection. This allows multiple transactions at the same merchant to share a single geospatial reference.

### 3. Location Service (`services/locationService.js`)
The core intelligence engine:
- **Geocoding**: Uses a local cache-first strategy before falling back to external providers.
- **Proximity Search**: Uses MongoDB `$near` operator for sub-second location lookups.
- **Hotspot Clustering**: Implements a distance-based clustering algorithm to identify high-density spending areas.

### 4. Background Processing (`jobs/geocodingJob.js`)
A background worker that retroactively geocodes historical transactions that lack spatial data, ensuring the "Map View" is populated even for old data.

## 🛠️ API Reference

### `GET /api/maps/nearby?lat={lat}&lng={lng}&radius={meters}`
Finds all transactions within a specific radius of a point.

### `GET /api/maps/hotspots`
Returns a list of location "clusters" where the user spends the most money physically.

### `POST /api/maps/backfill`
Triggers the background geocoding job.

## ✅ Implementation Checklist
- [x] Geospatial indexes added to `Transaction` and `Place` models.
- [x] Haversine distance utilities implemented.
- [x] Mock Geocoding adapter for development.
- [x] Aggregation-ready clustering logic.
- [x] Unit tests for geospatial arithmetic.

## 🧪 Testing
Run the geospatial test suite:
```bash
npm test tests/location.test.js
```
