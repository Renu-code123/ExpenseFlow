# Heterogeneous Data Export Engine & Automated Reporting Scheduler

## 🚀 Overview
Issue #659 evolves the static CSV export into a professional data orchestration engine. It allows users to generate complex, styled financial reports in various formats (PDF, XLSX, CSV, JSON) and schedule them for automated delivery via electronic channels.

## 🏗️ Technical Architecture

### 1. Data Aggregator Utility (`utils/dataAggregator.js`)
A headless analytical utility that:
- Segment data into category and time-series distributions.
- Calculates trend percentages (MoM/YoY growth).
- Extracts top merchants and cash-flow delta.

### 2. Multi-Template PDF/HTML Engine (`templates/financialTemplates.js`)
Uses a modular template approach to generate high-fidelity reports:
- **Monthly Summary**: Styled for general overview.
- **Tax Report**: Dense, data-heavy layout for auditing.
- **Inventory Audit**: Focuses on asset movement and valuation.

### 3. Core Generation Engine (`services/reportingEngine.js`)
A non-blocking service that coordinates:
- Database extraction via optimized MongoDB aggregation pipes.
- Statistical transformation.
- Format-specific rendering (MIME-type awareness).

### 4. Background Report Scheduler (`jobs/reportScheduler.js`)
An autonomous cron-worker that:
- Scans `ScheduledReport` logs hourly.
- Generates required report payloads.
- Dispatches attachments via `EmailService`.
- Self-replaces `nextRun` dates based on frequency.

## 🛠️ API Reference

### `POST /api/exports/generate`
Synchronously generates and streams a report based on provided filters.

### `POST /api/exports/schedule`
Registers a new recurring report.
```json
{
  "name": "Weekly Expenses",
  "frequency": "weekly",
  "format": "pdf",
  "recipients": ["manager@company.com"]
}
```

### `GET /api/exports/schedules`
Lists all active reporting schedules for the authenticated user.

## ✅ Implementation Checklist
- [x] Complex financial data aggregation utility.
- [x] HTML-to-PDF/Styled Template generator.
- [x] Recurring schedule persistence model.
- [x] Background cron worker for delivery.
- [x] Multi-format export API (PDF/XLSX/CSV/JSON).

## 🧪 Testing
Run the reporting engine test suite:
```bash
npm test tests/reporting.test.js
```
