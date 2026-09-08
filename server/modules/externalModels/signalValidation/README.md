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

## Calibrated probability contract

A promoted affirmative breakout row must also carry an upstream-calibrated primary probability and an explicit target describing the event that probability measures. TIBER-Fantasy never converts `final_signal_score` into a percentage.

Accepted primary probability columns, in precedence order:

- `breakout_probability`
- `calibrated_breakout_probability`
- `primary_breakout_probability`

Accepted target columns, in precedence order:

- `breakout_probability_target`
- `primary_breakout_probability_target`
- `probability_target`

All probability values are decimal probabilities in the closed interval `[0, 1]`. Values such as `73` are invalid; `0.73` is valid.

The producer may additionally export calibrated component probabilities that map directly to Command Center breakout outcomes:

- `p_top_12_next_4w`
- `p_top_24_next_4w`
- `p_ros_tier_jump`
- `p_adp_outperformance_12_slots`
- `p_role_expansion`

A compact draft tag can therefore render as `2026 Breakout · 73%` while preserving the exact probability target and the secondary probabilities for a tooltip or expanded player detail view. The percentage displayed on the badge is a whole-number rendering of the producer probability; the raw decimal remains in the API payload.

Example row fields:

```csv
player_id,player_name,breakout_label_default,breakout_probability,breakout_probability_target,p_ros_tier_jump,p_adp_outperformance_12_slots,p_role_expansion
00-0042051,Example Player,true,0.73,ros_tier_jump,0.73,0.61,0.68
```

If a promoted affirmative row lacks a primary calibrated probability or its target, the draft-tag endpoint fails closed with `invalid_payload`. The UI must not substitute signal score, rank, hit rate, or any locally derived heuristic as a probability.

## Contract

- Client: filesystem/export discovery, target-season manifest resolution, and read errors
- Adapter: CSV + JSON validation/normalization into stable TIBER-facing types, including calibrated probabilities
- Service: `getWrBreakoutLab()` plus promotion- and probability-gated `getWrBreakoutDraftTags(targetSeason)`
- Routes:
  - `GET /api/data-lab/breakout-signals[?season=<feature-year>]`
  - `GET /api/data-lab/breakout-signals/draft-tags?season=<target-year>`

The draft-tag response is identity-friendly and includes `playerId`, player name/team, candidate rank, signal score, context, model version, generated timestamp, a ready-to-render `displayLabel`, the primary calibrated probability, its target, and any secondary calibrated breakout probabilities.

Illustrative tag payload:

```json
{
  "label": "2026 Breakout",
  "displayLabel": "2026 Breakout · 73%",
  "probability": {
    "value": 0.73,
    "percent": 73,
    "target": "ros_tier_jump"
  },
  "probabilities": {
    "primary": 0.73,
    "primaryTarget": "ros_tier_jump",
    "top12Next4w": 0.21,
    "top24Next4w": 0.46,
    "rosTierJump": 0.73,
    "adpOutperformance12Slots": 0.61,
    "roleExpansion": 0.68
  }
}
```

## Product behavior

- Read-only only; no rescoring or mutation
- Empty, malformed, missing-export, stale-target, not-promoted, and invalid-probability states are surfaced explicitly
- The WR Breakout Lab adds client-side sort/search/filter controls plus grouped read-only detail sections for exported signal cards
- TIBER-Fantasy displays promoted Signal-Validation-Model outputs and does not recompute breakout logic
- Draft badges fail closed: no upstream promotion proof means no breakout tag
- Draft badges also fail closed when calibrated probability evidence is absent or invalid
