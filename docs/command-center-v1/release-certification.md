# Command Center v1 — Personal Release Certification

Status target: `command_center_v1_certified_personal_release`

Release branch: `release/command-center-v1-personal`

Release-candidate base: `14fec922a77e85e2a13b1a657df9db154eed33ef`

This document is the Gate 5 release freeze for the personal Fantasy Football Command Center. It certifies the **earned release boundary**, not every experimental or legacy subsystem present in the repository.

The dedicated release branch is intentionally anchored to the Gate 4 candidate. Newer work on `main` is post-freeze development and is **not** implicitly part of the certified v1 release. A feature must pass a later explicit promotion/recertification step before it can enter this release lineage.

## Release boundary

The personal release includes the shared desktop application and the same application installed as a Home Screen PWA on the operator's iPhone. The final human remains the only authority for fantasy actions.

Certified routes:

- `/command-center` — Home / What Changed; fail-closed when governed change evidence is unavailable.
- `/command-center/weekly` — Weekly Decisions; governed contract or typed abstention only.
- `/command-center/waivers` — explicit unsupported-domain state; legacy waiver heuristics are not release authority.
- `/command-center/trades` — explicit unsupported-domain state; legacy trade heuristics are not release authority.
- `/management` — read-only league/roster context under the Gate 0 truth boundary.
- `/draft-review` — read-only Sleeper Draft Review containment surface.
- `/records` — read-only reconstructable Sleeper history/records surface.
- `/player/:playerId` — inspection-only Player Intelligence; desktop-first condensed on phone.

A typed unavailable/unsupported state is considered a valid certified behavior. Fabricated advice is not.

## Gate matrix

| Gate | Result | Release meaning |
| --- | --- | --- |
| Gate 0 | Certified | Scoped personal identity, exact league/roster/owner truth, observed starters, sparse/stale fail-closed behavior. |
| Gate 1 | Certified | Core owner workflows have truthful read-only, inspection-only, or typed fail-closed outcomes; no legacy model is silently promoted. |
| Gate 2 | Certified | Immutable decision receipts, frozen replay, deterministic invariants, independent challenger, golden traces, postgame process evaluation, adversarial red team. |
| Gate 3 | Certified | Production build, runtime health/readiness, baseline-aware CI, synthetic-fallback quarantine, browser resilience, realistic list performance, active-surface fallback audit. |
| Gate 4 | Certified | Personal iPhone/PWA software contract: 375/390/430 px, safe areas, touch/focus geometry, service-worker privacy, offline fail-closed behavior, lifecycle recovery, zoom, phone-scale list performance. |
| Gate 5 | Certification workflow required | Re-run the frozen Gate 0–4 contract, production dependency audit, exact build, built desktop browser certification, built mobile/PWA certification, and realistic mobile list test on one final PR head and again on the merged release commit. |

## Runtime binding

The certified lineage is `release/command-center-v1-personal`. The personal release is built with:

`sh build.sh`

and started with:

`node dist/index.mjs`

The private runtime profile is `full`. `/api/health` is process liveness; `/api/health/db` is database transport readiness. Transport readiness is **not** proof that an empty database has the full application schema. Private Management state requires the provisioned application schema and must fail closed/degrade when required schema or evidence is unavailable.

PWA binding:

- `/manifest.json`
- `/sw.js`
- root service-worker scope
- `/api/*` bypasses the service-worker response pipeline entirely
- service-worker CacheStorage must contain zero private/live API URLs after real API traffic

## Rollback

Two explicit rollback points are retained:

1. `14fec922a77e85e2a13b1a657df9db154eed33ef` — Gate 4 runtime-equivalent rollback if final release metadata/certification wiring is suspect.
2. `1d59ef7f01b7444b6d7752f709344fe7f8098ced` — pre-mobile Gate 3 rollback if Gate 4 mobile runtime behavior itself is implicated. Disable the personal iPhone path until recertified in that case.

The exact Gate 5 merge commit becomes the pinned v1 personal-release commit after the final PR is green, merged into `release/command-center-v1-personal`, and the post-merge Gate 5 workflow is green on that merge commit.

## Known non-blocking debt

No P0 or P1 debt is accepted in this certificate. Retained P2/P3 debt is explicit:

- repository-wide legacy TypeScript baseline outside the certified release delta;
- SPA large-chunk/code-splitting optimization debt, with representative browser timings still release-gated;
- blank-database schema bootstrap debt: transport health is separated from application-schema provisioning;
- final physical Add-to-Home-Screen gesture remains operator/device acceptance rather than an automated CI action;
- Player Intelligence remains desktop-first condensed on phone and inspection-only.

These items must not be silently reclassified as certified capabilities.

## Release prohibitions

The v1 release does not authorize autonomous lineup, waiver, trade, draft, keeper, or roster writes. It does not authorize App Store/native iOS expansion. Devy, keeper, chopped/guillotine, public distribution, and other parked roadmap work remain outside the frozen release-critical path.

## Final certification rule

The Gate 5 PR may merge only when the exact PR head is green for the final release workflow and the existing independent release checks it triggers. It must target `release/command-center-v1-personal`, not moving `main`. After merge, the Gate 5 workflow must pass again on the exact release-branch merge commit before that SHA is recorded in the canonical release ledger.

Success terminal state:

`command_center_v1_certified_personal_release`

Failure terminal state:

`command_center_v1_blocked_with_explicit_gate_failures`
