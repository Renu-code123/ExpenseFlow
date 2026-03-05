# PR: Risk-Adaptive API Gateway + Behavioral Anomaly Engine

## Summary

Replace static gateway rule enforcement with a risk-adaptive mediation layer and add an initial behavioral anomaly engine. Requests are scored in real time (device posture, IP reputation, session confidence, behavioral deviation, geo-velocity, endpoint sensitivity) and mapped to enforcement tiers (0–4) that drive dynamic rate-limits, conditional MFA step-ups, throttling/blocking, and audit logging. The behavioral engine learns per-user baselines (EWMA), scores deviations, persists anomalies, and provides explainability metadata.

Related issues: #869 (Risk-adaptive API Gateway), #870 (Behavioral Anomaly Engine — initial implementation)

---

## Key Changes

- Middleware: `middleware/apiGateway.js` — inline risk scoring, enforcement tiers, decision trail recording.
- Policy Service: `services/apiGatewayPolicyService.js` — support for `adaptiveRisk` schema and `sensitivityTag`.
- Config: `config/apiGatewayPolicies.json` — default `adaptiveRisk` block and per-route sensitivity overrides.
- Admin Routes: `routes/apiGateway.js` — `GET /api/gateway/risk-health`, `GET /api/gateway/decisions`.
- Behavior Engine: `services/behavioralAnomalyEngineService.js` — EWMA baseline learning, scoring, explainability hooks.
- Models: `models/BehaviorBaseline.js`, `models/BehaviorAnomalyLog.js` — Mongoose models for baselines and anomaly logs.
- Docs: `PR_869_risk_adaptive_gateway.md` — this document.

---

## How to try locally

1. Install dependencies and validate policy JSON:

```bash
npm install
node -e "JSON.parse(require('fs').readFileSync('config/apiGatewayPolicies.json','utf8')); console.log('policy-json-ok')"
```

2. Start server (dev):

```bash
npm start
# or
node server.js
```

3. Hit admin endpoints (admin auth required):

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/gateway/risk-health
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/gateway/decisions?limit=50"
```

Notes:
- The gateway scoring runs in shadow mode by default (no automatic account lockouts). Toggle enforcement via `adaptiveRisk` policy entries.
- Ensure you have runtime dependencies installed (e.g., `jsonwebtoken`) and that Mongoose is connected to persist baselines / anomaly logs.

---

## Acceptance Criteria Mapping

- Real-time scoring & enforcement: implemented in `middleware/apiGateway.js`.
- Hot-reload policy changes: handled by `services/apiGatewayPolicyService.js`.
- Audit trail & correlation IDs: decision entries + admin endpoints in `routes/apiGateway.js`.
- Behavioral baseline & anomaly logs: `models/BehaviorBaseline.js` and `models/BehaviorAnomalyLog.js`, used by `services/behavioralAnomalyEngineService.js`.

---

## Safety, Rollback & Operational Guidance

- Default-safe: shadow/monitoring mode enabled by default; enforcement is configurable per-policy.
- Decision trail is currently in-memory — for multi-instance production deploy, persist to Redis or DB.
- To disable adaptive behavior: revert `adaptiveRisk` blocks in `config/apiGatewayPolicies.json` or unregister the middleware in `server.js`.

---

## Known Gaps & Next Steps

- Persist decision trail for multi-instance deployments (Redis or DB).
- Add unit and integration tests (scoring logic, policy merge, enforcement paths).
- Add performance benchmarks for scoring latency under load.
- Confirm production readiness: install all runtime deps, ensure migrations for new Mongoose models, and run end-to-end tests.

---

## Suggested PR Body

Title: `Risk-Adaptive API Gateway + Behavioral Anomaly Engine (Issues #869, #870)`

Body: Use the content of this file as the PR description. Include links to the issues and request review from security and platform teams. Mention that the default mode is shadow/monitoring and recommend staging rollout and telemetry monitoring.

---

If you want, I can open a PR on branch `anomoly-engine-870` and push these changes now.
**PR: Risk-adaptive API gateway (#869)**

**Summary:**
- **What:** Transform the API gateway from static rule enforcement to a risk-adaptive request mediator that evaluates contextual risk per-request and adjusts rate limits, authentication, and response controls in real time.
- **Why:** Reduce false positives from static thresholds, enforce step-up / throttling policies based on observable risk, and provide a full audit trail for decisions.

**Related Issue:** Risk-adaptive-api-gateway #869

**Contributor:** Gupta-02

**Files changed / created (high-level):**
- **Middleware:** [middleware/apiGateway.js](middleware/apiGateway.js) — core adaptive scoring, enforcement tiers, dynamic rate-limit math, step-up MFA enforcement, geo-velocity and behavior signals, decision trail and logging.
- **Routes:** [routes/apiGateway.js](routes/apiGateway.js) — admin endpoints for risk health and decision audit: `GET /api/gateway/risk-health` and `GET /api/gateway/decisions`.
- **Service:** [services/apiGatewayPolicyService.js](services/apiGatewayPolicyService.js) — extended policy merge and validation to support `adaptiveRisk` declarative schema and `sensitivityTag` overrides.
- **Config:** [config/apiGatewayPolicies.json](config/apiGatewayPolicies.json) — added `adaptiveRisk` default section and per-route `sensitivityTag` and overrides.

**Design overview:**
- Inline risk scoring composes signals: device posture & trust, IP reputation, session confidence, endpoint sensitivity, historical behavior (burst/anomaly), and geo-velocity. Scores are normalized 0–100.
- Scoring maps to enforcement tiers:
  - Tier 0: Transparent (no enforcement)
  - Tier 1: Soft monitoring
  - Tier 2: Step-up authentication (MFA required)
  - Tier 3: Throttled / restricted (write methods blocked)
  - Tier 4: Blocked (SOC alert logged)
- Dynamic rate limits are computed by applying configurable multipliers per tier to the route's base limit.
- All policy changes are hot-reloaded by the existing policy service; `adaptiveRisk` schema supports per-route overrides.

**Observability & audit:**
- Decision log entries emitted as structured logs `API_GATEWAY_RISK_DECISION` and `API_GATEWAY_ENFORCEMENT_TRANSITION` and kept in a small in-memory trail accessible via admin endpoint for quick inspection.
- Correlation IDs honored (`X-Correlation-Id`, `X-Request-Id`, forensic trace) and included in logs.

**Admin / Debug endpoints:**
- `GET /api/gateway/risk-health` — returns runtime scoring latency and counters.
- `GET /api/gateway/decisions?limit=100&correlationId=...&actorKey=...&minTier=2` — read recent decision trail.

**How to exercise (manual):**
- Example: trigger step-up auth by simulating high risk headers on a protected endpoint.

```bash
# low-risk request (transparent)
curl -i -H "Authorization: Bearer <token>" \
  -H "X-Device-Posture: trusted" \
  http://localhost:3000/api/expenses

# high-risk request (forces tier 2+ behavior)
curl -i -H "X-Device-Posture: compromised" \
  -H "X-Ip-Reputation-Score: 10" \
  -H "X-Session-Confidence: 20" \
  -H "X-Geo-Lat: 40.7128" -H "X-Geo-Lon: -74.0060" -H "X-Geo-Timestamp: $(date +%s)" \
  http://localhost:3000/api/auth/login
```

**Acceptance criteria mapping:**
- Real-time policy switching without restart: supported via existing hot-reload in [services/apiGatewayPolicyService.js](services/apiGatewayPolicyService.js).
- <50ms scoring overhead: lightweight scoring is inline and tracks latency; health shows avg latency and budget warnings.
- Configurable risk thresholds: `adaptiveRisk.thresholds` per-route and default in [config/apiGatewayPolicies.json](config/apiGatewayPolicies.json).
- Full audit trail: decision entries saved in-memory and logged; persistent decision logging already exists in `services/adaptiveRiskEngineV2Service.js` for login risk evaluations.
- Reduction in false positives: heuristic + ML ensemble (existing service) integration aims to improve signal quality — route-level sensitivity tags reduce over-blocking on webhook and low-sensitivity endpoints.

**Notes / Next steps**
- This change depends on existing token verification and models; run full integration tests in an environment with the real `jsonwebtoken` and DB (RiskDecisionLog, RiskPolicyVersion) available.
- Consider backing the in-memory `riskDecisionTrail` to a short-lived store (Redis) if you need cross-instance audit or retention across restarts.
- I can add unit tests and a small benchmark script to measure scoring latency across 1000 requests — say if you want a perf PR follow-up.

--
Generated for PR #869 by Gupta-02.
