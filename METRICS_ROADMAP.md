# Advanced Metrics Roadmap

> [!IMPORTANT]
> **Status: legacy tactical metric backlog, not current FFCC analytics authority.**
>
> This file predates the 2026 CCF/Player Outcome, source-governance, and external-model boundaries. It remains useful as an inventory of candidate nflverse-derived metrics, but its old phase ordering and "automatically flow to FORGE Alpha" language do not authorize runtime scoring changes.
>
> For the current deep-analytics coverage map, duplication checks, ownership boundaries, anti-double-counting doctrine, priorities, and promotion gates, see `docs/architecture/FFCC_DEEP_ANALYTICS_GAP_AUDIT_2026-09-18.md`.
>
> New analytics must preserve point-in-time provenance, explicit missingness, family-level ablation, current CCF recommendation authority, and the frozen certification scope.

## ✅ Already Implemented (Gold Layer)
- YPRR, TPRR, target share, ADOT
- EPA per target, EPA per rush
- Snap share, route rate
- Stuff rate, first down rates
- CPOE, sack rate, QB hits
- RACR, WOPR, catch rate

## 🎯 High Priority - Easy Wins (Data Available Now)

### 1. Success Rate (ALL POSITIONS)
**Source**: `bronze_nflfastr_plays.raw_data->>'success'`
**Calculation**: `SUM(success) / COUNT(*) WHERE play_type IN ('pass', 'run')`
**Value**: Core efficiency metric, better than EPA for understanding "winning plays"

### 2. Expected YAC Metrics (WR/TE/RB)
**Source**: `bronze_nflfastr_plays.raw_data->>'{xyac_mean_yardage, xyac_epa, xyac_success}'`
**Metrics**:
- `xYAC` (expected YAC per reception)
- `YAC over expected` (actual - xYAC)
- `xYAC success rate` (% of catches exceeding xYAC)
**Value**: Measures RAC ability independent of target quality

### 3. Shotgun/No-Huddle Rates (QB)
**Source**: `bronze_nflfastr_plays.raw_data->>'{shotgun, no_huddle}'`
**Metrics**:
- `shotgunRate` (% of plays from shotgun)
- `noHuddleRate` (% of plays in no-huddle)
- `shotgunSuccessRate` (success rate diff: shotgun vs under center)
**Value**: Shows QB tendencies and play-calling context

### 4. Target Quality (WR/TE/RB)
**Source**: `bronze_nflfastr_plays.raw_data->>'{air_epa, comp_air_epa}'`
**Metrics**:
- `avgAirEPA` (average EPA of targets before catch)
- `avgTargetQuality` (air EPA per target)
**Value**: Separates QB play from receiver skill

### 5. Pass Location/Depth Splits (WR/TE)
**Source**: `bronze_nflfastr_plays.raw_data->>'{pass_location, pass_length}'`
**Metrics**:
- `leftTargetPct`, `middleTargetPct`, `rightTargetPct`
- `shortTargetPct`, `deepTargetPct`
- `deepTargetShare` (% of team's deep targets)
**Value**: Route tree analysis, shows role in offense

### 6. Run Gap/Location Splits (RB)
**Source**: `bronze_nflfastr_plays.raw_data->>'{run_gap, run_location}'`
**Metrics**:
- `insideRunPct`, `outsideRunPct`
- `leftRunPct`, `rightRunPct`
- `efficiencyByGap` (YPC by run direction)
**Value**: Shows scheme fit and running style

## 🔮 Medium Priority - Requires New Data Sources

### 7. Pressure Metrics (QB)
**Source**: ❌ Not in NFLfastR (need PFF or NGS)
**Metrics**: Pressure rate, time to throw, clean pocket EPA
**Alternative**: Could estimate from sacks + QB hits

### 8. Route Running (WR/TE)
**Source**: ❌ Not in NFLfastR (need PFF or NGS)
**Metrics**: Route tree breakdown, avg separation, target separation
**Alternative**: We have `slot_rate`/`inline_rate` from player_usage

### 9. Contact Metrics (RB)
**Source**: ❌ Not in NFLfastR (need PFF or NGS)
**Metrics**: Yards after contact, broken tackles, contact balance
**Alternative**: Could estimate "elusive rating" from YAC/carry vs expected

## 📋 Implementation Order

**Phase 1** (This session):
1. Success rate (applies to all positions)
2. xYAC metrics (WR/TE/RB receiving)
3. Shotgun/No-huddle rates (QB)

**Phase 2** (Next session):
4. Target quality splits (WR/TE/RB)
5. Pass location/depth distribution (WR/TE)
6. Run gap/location splits (RB)

**Phase 3** (Future):
7. Explore Big Data Bowl datasets (advanced tracking data)
8. Explore ESPN/PFF APIs for proprietary metrics

## 🎨 UI Integration Notes

Historical UI note: these metrics were originally intended for Data Lab and related research surfaces. No metric in this file should automatically enter FORGE, CCF, rankings, or recommendation logic. Runtime influence requires its own governed producer/consumer contract and promotion evidence.
