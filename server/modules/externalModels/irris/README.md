# IRRIS External Model Adapter

This directory is the TIBER-Fantasy consumer boundary for **IRRIS — Injury, Recovery & Readiness Intelligence System** produced by TIBER-Forecast.

## Ownership

- **TIBER-Data** owns governed public injury/news/practice/workload evidence contracts and provenance.
- **TIBER-Forecast** owns probabilistic diagnosis, severity, recovery, readiness, scenario, and functional-limitation inference.
- **TIBER-Fantasy** owns transport, validation, stable product-facing mapping, and orchestration only.

No medical inference logic belongs in this adapter.

## Safety / epistemic contract

The adapter requires `inference_status=model_inference_not_medically_confirmed`. A payload that drops or changes that marker is rejected as invalid.

Official game status remains a separate field. TIBER-Fantasy must not replace an official designation with IRRIS inference. The UI may show both and may highlight disagreement.

Concussion assessments may use `medicalClearanceForecast=not_predicted`; downstream surfaces must never convert this into an asserted clearance decision.

## Files

- `irrisClient.ts` — authenticated Forecast transport with timeout/config handling.
- `irrisAdapter.ts` — validates probabilities, scenario normalization, inference marker, and maps the Forecast payload into a stable TIBER-facing shape.
- `irrisService.ts` — fail-closed service wrapper with stable error categories.
- `types.ts` — internal interface and error types.
- `__tests__/irrisAdapter.test.ts` — contract-boundary regressions.

## Configuration

- `FORECAST_IRRIS_ENABLED` — set `0` to disable; defaults enabled.
- `FORECAST_IRRIS_BASE_URL` — preferred Forecast service URL; falls back to `FORECAST_MODEL_BASE_URL`.
- `FORECAST_IRRIS_API_KEY` — preferred Forecast API key; falls back to `FORECAST_API_KEY`.
- `FORECAST_IRRIS_TIMEOUT_MS` — request timeout; default 5000ms.

If URL/key configuration is absent, the service returns `config_error`; it does not fabricate an insight.

## Activation status

This branch implements and tests the consumer boundary. It intentionally does **not** modify the legacy Start/Sit engine, which is classified EXTRACT/frozen for net-new recommendation logic. Product activation should occur through a bounded player-research/player-lens enrichment or a dedicated integration route after the Forecast branch is deployed and the TIBER-Data evidence feed is admitted.
