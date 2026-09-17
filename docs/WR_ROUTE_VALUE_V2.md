# WR Route Opportunity Value v2

Status: implemented model contract; production activation remains data-provider gated.

## Purpose

WR Route Opportunity Value (ROV) answers a different question from target efficiency or raw route volume:

> How much fantasy value does a receiver create or project to create for each route he actually runs, given the route family he is asked to run?

The model explicitly separates **route earning** from **target efficiency**. A target-only feed is therefore not admissible for ROV because it cannot estimate `P(target | route run)`.

## Canonical unit

The atomic input is **one receiver route run**. Each observation carries:

- player, season, week
- normalized route family
- targeted/not targeted
- catch result when targeted
- receiving yards and YAC when caught
- touchdown and first-down result
- air yards when targeted
- red-zone and end-zone-target flags when available

Missing optional context remains missing. It is never silently converted into evidence of zero usage.

## Route-family taxonomy

Provider labels normalize into these stable families:

| Family | Interpretation archetype |
| --- | --- |
| post | leverage |
| corner | leverage |
| crosser | all-around |
| slant | all-around |
| dig | intermediate |
| out | intermediate |
| go/fade | volatile ceiling |
| hitch/curl | floor/manufactured |
| screen | floor/manufactured |
| flat | floor/manufactured |
| other | unknown |

These archetypes are **descriptive labels only**. They do not apply numeric bonuses or penalties. The numeric route hierarchy is learned from the historical observations supplied to the model.

This prevents a common modeling mistake: treating an average league-wide route ranking as though it were universally true for every receiver, quarterback, offense, coverage environment, and season.

## Core outputs

For each route family in a player's eligible history, v2 emits:

- routes and route share
- targets and target rate per route
- catch rate on targets
- receiving yards per route
- YAC per reception
- air yards per target
- touchdown rate per route
- first-down rate per route
- explosive-play rate per route
- end-zone target rate per route
- expected PPR points per route
- floor PPR per route
- ceiling PPR per route
- red-zone PPR per route
- league route-family baseline
- player advantage versus the league route-family baseline
- sample confidence

The player profile also emits route-mix-weighted overall values.

## Expected value

For the default PPR scoring profile, each historical route outcome is scored from actual fantasy components:

`PPR(route) = reception + 0.1 * receiving_yards + 6 * receiving_TD`

The player's route-family mean is then empirical-Bayes shrunk toward the contemporaneous league mean for the same route family:

`ROV = (player_points + prior_routes * league_family_PPR_per_route) / (player_routes + prior_routes)`

The same principle is applied to target rate, catch rate, yardage rate, TD rate, first-down rate, explosive rate, and end-zone target rate. Sparse samples therefore become less extreme rather than falsely precise.

The scoring settings are injectable so downstream league-specific scoring can replace the default PPR constants without changing route semantics.

## Floor and ceiling

v2 does not invent arbitrary floor/ceiling weights.

For each family, it calculates weekly `PPR / route` observations and uses:

- **Floor Route Value:** 25th percentile weekly PPR/route
- **Ceiling Route Value:** 90th percentile weekly PPR/route

Player quantiles are blended toward the corresponding league route-family quantiles according to sample weight. This makes floor and ceiling empirical distribution properties instead of labels such as "slants are floor routes" or "go routes are ceiling routes."

The archetype labels remain available for explanation, but they never override the data.

## Red-zone value

Red-zone route value is PPR per actual red-zone route, shrunk toward the league family red-zone baseline.

If a player has **no observed eligible red-zone routes**, the output is `null`, not `0`. No evidence and evidence of zero production are different states.

## Player-vs-league route advantage

For each family:

`advantage_vs_league = player_shrunk_PPR_per_route - league_family_PPR_per_route`

This allows FFCC to identify player-specific route strengths without assuming the same route is equally valuable for every receiver.

A future contextual layer can condition the baseline more deeply on alignment, motion, coverage, quarterback, field position, and receiver archetype once those inputs have reliable point-in-time coverage.

## Point-in-time / leakage doctrine

ROV v2 is pregame-only.

For a prediction key `(player_id, season, week, timeframe=pregame)`, only observations from:

- earlier seasons, or
- earlier weeks in the same season

are eligible.

The target week and all future weeks are excluded even if the underlying database has already ingested them. This is an explicit anti-leakage boundary rather than a caller convention.

## Confidence

`confidence = player_family_routes / (player_family_routes + prior_routes)`

This value describes **sample weight**, not the probability that a prediction is correct. It exists so downstream models and explanations can distinguish established route evidence from heavily shrunk small samples.

## Relationship to WR Role Bank v1.1

WR Role Bank v1.1 already captures:

- route volume
- target volume/share
- slot/outside alignment
- deep-target usage
- consistency and momentum

ROV v2 fills the missing route-family-quality layer. It does not replace those features.

Deep-target rate remains useful because air-yard leverage and route-family identity are not interchangeable. A post, corner, go, and deep over may all create deep targets through materially different mechanisms.

## Production activation gate

The computation layer is implemented in `server/wrRouteValue.ts` and tested independently. It should **not** be activated in production merely because the model exists.

Activation requires a route-charting source that supplies all receiver route runs—not only targeted plays—with sufficient historical and current-week coverage. The adapter must preserve:

1. player identity mapping
2. route-family source label plus normalized family
3. season/week point-in-time availability
4. target and outcome fields
5. provider/source provenance
6. explicit missingness
7. coverage auditing by player/team/week

Until that source is present, FFCC should expose ROV as unavailable rather than infer route families from target depth or alignment.

## Future contextual extensions

Once source coverage exists and is independently validated, the next admissible extensions are:

- route family × alignment
- route family × motion
- route family × man/zone shell
- route family × press/off coverage
- route family × QB
- route family × field position / red-zone band
- route family × receiver archetype
- route-family change detection for role shifts
- opponent route-family vulnerability, with defensive sample shrinkage

These are conditional refinements of one route-value system, not separate competing scores.

## Non-negotiable guardrails

- No hard-coded route-family fantasy multipliers.
- No target-only route feed.
- No same-week information in pregame features.
- No treating missing route/red-zone context as zero.
- No sparse-sample leaderboards without shrinkage/confidence.
- No double-counting route value, deep-target value, and generic efficiency without feature-correlation checks during model calibration.
- Route archetypes explain mechanisms; observed data determines numeric value.
