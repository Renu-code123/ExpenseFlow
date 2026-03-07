# Real-Time Data Loss Prevention (DLP)

## Overview
This module provides real-time DLP for outgoing data in ExpenseFlow. It scans API responses and exports for sensitive information and enforces policies (block, alert, log).

## Components
- `dlp-engine.js`: Core detection and policy evaluation
- `dlp-middleware.js`: Express middleware for outgoing responses
- `dlp-config.js`: Patterns and policies configuration
- `dlp-logger.js`: Audit trail for DLP events
- `dlp-utils.js`: Helper functions (masking, etc.)
- `dlp-test.js`: Unit tests

## Usage
1. Add `dlp-middleware` to your Express routes.
2. Configure patterns and policies in `dlp-config.js`.
3. Check `dlp-audit.log` for DLP events.

## Extending
- Add new patterns/policies in `dlp-config.js`.
- Integrate with alerting systems as needed.
