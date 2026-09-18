# FFCC Personal Beta Readiness — Active Queue

Canonical gate: `docs/architecture/PERSONAL_BETA_READINESS_GATE.md`

## P0 — required for trustworthy weekly personal beta

- [ ] PB-01 source spine: qualify the exact production sources needed by the active weekly surface; build/complete real parsers and reliability reviews; preserve fail-closed unavailable states.
- [ ] PB-02 historical dataset: freeze first production-candidate player × game × decision-as-of dataset with exact known-at provenance.
- [ ] PB-03 CCF certification: freeze Baseline 1.0 and execute rolling-origin validation + immutable result receipt, including TIBER-off replay and feasible-lineup regret.
- [ ] PB-04 authority cutover: bind active weekly routes to URAG/CCF-native authority; remove any silent legacy/challenger unlock path.
- [ ] PB-05 Sleeper live preflight: run against Anthony's real portfolio when access is available; exact scoring/roster/matchup truth only.
- [ ] PB-06 Sleeper action safety: finish explicit-approval, legality/lock, idempotency, stale-state and post-action-readback boundaries before enabling writes.
- [ ] PB-07 Devy linkage: live-validate spreadsheet ↔ Sleeper league/roster/player identity; unresolved joins remain explicit.
- [ ] PB-08 exact-candidate smoke: league load → decision packet → native recommendation/abstention → provenance → action preview/readback.

## Immediate execution order

1. Build the personal-beta gate/status evaluator so readiness cannot be inferred from prose.
2. Reuse the source-qualification and URAG primitives from the CCF-first branch; do not create parallel authority semantics.
3. Build the executable certification-manifest/result-receipt path around the predictive-validation protocol from PR #33.
4. Add integration tests that intentionally leave Sleeper external approval unavailable while proving all preparable action-safety logic works.
5. Reconcile branch dependency order and merge only foundations that pass exact-head CI and do not overclaim production authority.
6. Perform real-account/profile smoke tests in an authorized local/Work environment where credentials/private files are available.

## Non-blocking / defer until after beta gate

Beat Vegas productionization; broad MPI ingestion; complete expert-source breadth; long-tail contract mechanics; all USR families; public multi-user deployment; Chrome Web Store publication; cosmetic polish.
