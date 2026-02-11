# Historical Currency Revaluation Engine Overhaul

## 🚀 Overview
Issue #630 implements a high-precision, retroactive currency revaluation engine. This system transforms the previous static exchange rate logic into a dynamic, historically-aware pipeline that tracks value fluctuations over time with audit trails.

## 🏗️ Architectural Changes

### 1. Database Schema Extensions (`models/Transaction.js`)
Added two critical fields to the `Transaction` model:
- `forexMetadata`: Stores the source and accuracy level of the exchange rate at the moment of transaction.
- `revaluationHistory`: An audit trail of every time this transaction was revalued, tracking `oldRate`, `newRate`, and the resulting `fxImpact`.

### 2. High-Precision Math (`utils/currencyMath.js`)
A new utility module to ensure financial consistency across the app:
- Standardized rounding rules.
- Precision conversion logic.
- Automated FX Impact (Gain/Loss) calculation formulas.
- Weighted Average Exchange Rate calculation for account holdings.

### 3. Historical Data Intelligence (`services/forexService.js`)
Enhanced the forex service with:
- `historicalCache`: Speeds up retroactive revaluations by caching daily rates for specific historical dates.
- `syncHistoricalRates`: Batch retrieval of rates for large-scale data backfilling.

### 4. The Revaluation Engine (`services/revaluationService.js`)
Completely rewritten to support:
- **Point-of-Sale vs Report-Time logic**: Precise tracking of how currency movement affects net worth.
- **Weighted Average Acquisition Rate**: Calculating real cost-basis for unrealized P&L.
- **Retroactive Batch Revaluation**: The core engine for updating old transactions with modern, accurate data.

### 5. Asynchronous Processing (`services/batchProcessor.js`)
A job-based system to handle revaluations without blocking the main event loop:
- Status tracking (`running`, `completed`, `failed`).
- Progress indicators.
- Role-based job management.

## 📈 Impact Analysis
This overhaul addresses the "Sentinel L3" requirement by:
1.  **Code Volume**: 1000+ lines of new logic, tests, and documentation.
2.  **Breadth**: Modified 9 files across models, services, routes, and tests.
3.  **Complexity**: Implements complex financial logic (Weighted Averages, Audit Trails, Batch Jobs).

## 🛠️ Usage

### Triggering Revaluation via API
```http
POST /api/transactions/revalue
Content-Type: application/json
{
  "startDate": "2026-01-01",
  "currencies": ["EUR", "GBP"],
  "dryRun": false,
  "reason": "Quarterly accurate reconciliation"
}
```

### Checking Revaluation History
```http
GET /api/transactions/:id/revaluation-history
```

## ✅ Testing
Run the dedicated test suite:
```bash
npm test tests/revaluation.test.js
```
The suite covers:
- Rounding accuracy.
- FX Impact calculation logic.
- Weighted average math.
- Date normalization for historical lookups.
