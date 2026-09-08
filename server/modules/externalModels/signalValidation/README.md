# Signal Validation external adapter

This adapter powers the read-only WR Breakout Lab in TIBER Data Lab and exposes fail-closed draft tags for upstream-promoted breakout signals.

## Inputs

- `wr_player_signal_cards_{feature_season}.csv`
- `wr_best_recipe_summary.json`
- `export_manifest.json`

By default the adapter reads from `./data/signal-validation`, or from `SIGNAL_VALIDATION_EXPORTS_DIR` when set.

### Season semantics

The ordinary Breakout Lab keeps the legacy feature-season lookup behavior: `season=2025` reads `wr_player_signal_cards_2025.csv`.

Draft tags use the target/outcome season instead. For example, a 2026 draft tag request requires an `export_manifest.json` with `feature_season: 2025` and `outcome_season: 2026`; the client then reads `wr_player_signal_cards_2025.csv`.

## Promotion contract for draft tags

The manifest must explicitly carry an upstream promotion block:

```json
{
  "feature_season": 2025,
  "outcome_season": 2026,
  "promotion": {
    "status": "promoted",
    "backtest_passed": true,
    "prescriptive_validation_passed": true,
    "promoted_at": "2026-09-01T00:00:00Z"
  }
}
```

TIBER-Fantasy does not infer these booleans from local thresholds or re-run the model. A draft tag is eligible only when all three upstream conditions are explicit: promoted status, successful backtest, and successful prescriptive validation. Missing, stale, candidate, rejected, or failed promotion evidence is blocked.

## Contract

- Client: filesystem/export discovery, target-season manifest resolution, and read errors
- Adapter: CSV + JSON validation/normalization into stable TIBER-facing types
- Service: `getWrBreakoutLab()` plus promotion-gated `getWrBreakoutDraftTags(targetSeason)`
- Routes:
  - `GET /api/data-lab/breakout-signals[?season=<feature-year>]`
  - `GET /api/data-lab/breakout-signals/draft-tags?season=<target-year>`

The draft-tag response is intentionally minimal and identity-friendly (`playerId`, player name/team, candidate rank, signal score, context, model version, generated timestamp) so draft surfaces can render a badge such as `2026 Breakout` without copying model logic into the UI.

## Product behavior

- Read-only only; no rescoring or mutation
- Empty, malformed, missing-export, stale-target, and not-promoted states are surfaced explicitly
- The WR Breakout Lab adds client-side sort/search/filter controls plus grouped read-only detail sections for exported signal cards
- TIBER-Fantasy displays promoted Signal-Validation-Model outputs and does not recompute breakout logic
- Draft badges fail closed: no upstream promotion proof means no breakout tag
