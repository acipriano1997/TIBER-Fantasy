import type { CCFTiberCapabilityMigrationRecord } from "./tiberCapabilityMigration";

/**
 * Supplemental capability audit from the exhaustive TIBER-Data / TIBER-Rookies
 * pass. Kept separate from the original registry so the audit history remains
 * reviewable. These records are combined by allTiberCapabilityMigration.ts.
 */
export const CCF_TIBER_CAPABILITY_MIGRATION_EXTENSIONS_V0: readonly CCFTiberCapabilityMigrationRecord[] = [
  {
    id: "data-source-state-support-windows",
    sourceSystem: "TIBER-Data",
    sourceCapability:
      "explicit source-state/support-window semantics that distinguish promoted governed truth from fixture, stale, provisional, unknown, and bounded coverage",
    sourceEvidence: ["docs/contracts/promoted-artifacts-index.md"],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF source spine + feature-evidence eligibility",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note:
      "CCF already preserves temporal mode, hashes and missingness, but must make source-state/support-window eligibility explicit so directory placement or artifact naming can never imply truth.",
  },
  {
    id: "data-weather-evidence-contract",
    sourceSystem: "TIBER-Data",
    sourceCapability:
      "point-in-time multi-provider game-weather evidence with stadium geometry, separate roof-state evidence, normalized variables, deterministic field-relative wind, and explicit unavailable semantics",
    sourceEvidence: [
      "src/contracts/v1/gameWeatherEvidence.ts",
      "docs/contracts/game-weather-evidence-v1.md",
      "docs/governance/weather-intelligence-follow-on-queue.md",
    ],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF Weather Intelligence System",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "ablation",
      "tiber_off",
    ],
    note:
      "Mine the evidence/temporal/geometry mechanisms, not provider weights or fantasy-impact assumptions. Weather must remain unavailable when source-backed evidence is unavailable.",
  },
  {
    id: "rookies-athletic-draft-signal-features",
    sourceSystem: "TIBER-Rookies",
    sourceCapability:
      "athletic/combine normalization, SPORQ-style historical context, draft signal/capital, and position-aware prospect context features",
    sourceEvidence: [
      "scripts/audit_athletic_score_normalization.py",
      "scripts/build_sporq_historical.py",
      "scripts/enrich_historical_context_with_sporq.py",
    ],
    scope: "rookie_devy",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF rookie/devy feature spine",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "ablation",
      "subgroup_stability",
      "tiber_off",
    ],
    note:
      "Reconstruct from direct source facts and independently test incremental NFL/fantasy outcome value; do not copy a composite prospect score as native truth.",
  },
  {
    id: "rookies-historical-reconstruction-freeze",
    sourceSystem: "TIBER-Rookies",
    sourceCapability:
      "historical as-known-at reconstruction with frozen pre-draft/landing-context layers, SHA-256 binding, explicit refreeze reasons, and outcome contamination separation",
    sourceEvidence: [
      "docs/historical-reconstruction-contract.md",
      "scripts/build_2023_reconstruction_census.py",
      "scripts/freeze_2023_expectation_records.py",
    ],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF historical decision ledger + certification dataset builder",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "chronological_oos", "tiber_off"],
    note:
      "This is a direct anti-leakage pattern: freeze what was knowable before outcomes, bind bytes, and require an auditable reason for any re-freeze.",
  },
  {
    id: "rookies-transactional-artifact-promotion",
    sourceSystem: "TIBER-Rookies",
    sourceCapability:
      "fail-closed artifact integrity with frozen digests, fresh staging, validate-before-swap, compare-and-swap authorization snapshots, rollback, and preservation of rejected candidates",
    sourceEvidence: [
      "scripts/validate_experimental_integrity.py",
      "docs/migrations/2026-08-23-rookie-ml-lane-demotion.md",
    ],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF source/model artifact promotion store",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note:
      "CCF already hashes and verifies source snapshots. It still needs transactional staging/CAS/rollback semantics before mutable promotion workflows deserve the same integrity claim.",
  },
  {
    id: "rookies-experimental-ml-lane",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "legacy fixture-fed Rookie ML evaluation lane and probability-shaped diagnostics",
    sourceEvidence: ["docs/migrations/2026-08-23-rookie-ml-lane-demotion.md"],
    scope: "rookie_devy",
    disposition: "intentionally_retire",
    status: "intentionally_retired",
    ccfOwner: "CCF model research archive",
    requiredForUniversalCCF: false,
    promotionEvidenceRequired: [],
    note:
      "The source repo explicitly says this lane was never calibrated and is not promotion-eligible. Preserve only as historical research evidence; never resurrect its probability-shaped diagnostics as forecasts.",
  },
  {
    id: "rookies-devy-signal-discovery",
    sourceSystem: "TIBER-Rookies",
    sourceCapability:
      "Devy lifecycle/development-horizon discovery registry with uncertainty, provenance categories, actionability/volatility bands, and downstream blocking semantics",
    sourceEvidence: ["scripts/devy_signal_registry.py", "docs/devy-signal-discovery.md"],
    scope: "rookie_devy",
    disposition: "challenger_only",
    status: "challenger_only",
    ccfOwner: "CCF Devy evidence/watchlist layer",
    requiredForUniversalCCF: false,
    promotionEvidenceRequired: [],
    note:
      "Useful as structured discovery/context. The source implementation explicitly does not rank prospects, predict draft capital, or run Rookie Alpha; keep those interpretive signals outside native outcome authority.",
  },
  {
    id: "rookies-operator-signal-candidates",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "operator-curated prospect signal candidate workflow",
    sourceEvidence: ["scripts/build_operator_signal_candidates.py"],
    scope: "rookie_devy",
    disposition: "challenger_only",
    status: "challenger_only",
    ccfOwner: "CCF external/manual evidence layer",
    requiredForUniversalCCF: false,
    promotionEvidenceRequired: [],
    note:
      "Manual/operator observations may be preserved with provenance and tested later, but they cannot silently become CCF-native model truth.",
  },
] as const;
