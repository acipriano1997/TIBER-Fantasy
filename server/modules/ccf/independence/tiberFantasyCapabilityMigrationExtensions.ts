import type { CCFTiberCapabilityMigrationRecord } from "./tiberCapabilityMigration";

/**
 * Capability audit for valuable mechanisms that live in the TIBER-Fantasy
 * application itself rather than the Forecast/Data/Rookies repos.
 */
export const CCF_TIBER_FANTASY_CAPABILITY_MIGRATION_EXTENSIONS_V0: readonly CCFTiberCapabilityMigrationRecord[] = [
  {
    id: "fantasy-fire-role-opportunity",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "rolling role/opportunity/conversion engine with position-specific opportunity, team-denominator usage, xFP and market-context separation",
    sourceEvidence: ["server/modules/fantasyLab/README.md", "server/routes/fireRoutes.ts"],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF role/opportunity feature spine",
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
      "Preserve rolling opportunity/role/conversion decomposition and exact team denominators. Do not copy FIRE composite scores, old xFP outputs, or latest-known market values into native weekly truth.",
  },
  {
    id: "fantasy-matchup-sos-context",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "weekly/ROS matchup context combining opponent FPA, EPA, pace, red-zone, venue, alignment, coverage, pressure and offense-vulnerability mechanisms",
    sourceEvidence: [
      "server/modules/sos/MODULE.md",
      "server/modules/sos/contextSosService.ts",
      "server/modules/forge/dvpMatchupService.ts",
      "server/modules/dstStreamer.ts",
    ],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF matchup/game-environment feature spine",
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
      "Rebuild direct context facts and test mechanisms independently. Retire static DST vulnerability tables, fixed SoS blend weights, thresholds and legacy projection fallbacks.",
  },
  {
    id: "fantasy-sentinel-output-guardrails",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "low-latency model/output validation rules with stable rule IDs, severity, confidence, entity fingerprints and auditable issue lifecycle",
    sourceEvidence: [
      "server/modules/sentinel/MODULE.md",
      "server/modules/sentinel/sentinelEngine.ts",
      "server/modules/sentinel/sentinelRules.ts",
    ],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF output validation + certification guardrails",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "tiber_off"],
    note:
      "CCF already rejects invalid native outcome/source contracts, but needs a general rule/fingerprint/event lifecycle so operational anomalies remain auditable across model surfaces.",
  },
  {
    id: "fantasy-metric-matrix-similarity",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "multi-axis player vectors, similarity search, tier neighbors, confidence/missingness and connected-league ownership context",
    sourceEvidence: [
      "server/modules/metricMatrix/MODULE.md",
      "server/modules/metricMatrix/playerVectorService.ts",
      "server/modules/metricMatrix/similarPlayersService.ts",
      "server/modules/metricMatrix/tiersNeighborsService.ts",
      "server/modules/metricMatrix/leagueOwnershipService.ts",
    ],
    scope: "decision_value",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF player-vector / similarity / portfolio context layer",
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
      "Keep vector/similarity/missingness/ownership concepts, but replace position caps, hardcoded weights, defaults and tiers with governed CCF features and validated distance/cluster policies.",
  },
  {
    id: "fantasy-management-use-activation-gates",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "per-use activation gating over availability, contract match, provenance, governance, coverage, freshness, fail-closed consumer behavior and UI labeling",
    sourceEvidence: ["server/modules/management/managementGateEvaluator.ts"],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF evidence activation policy",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note:
      "This prevents one source from being globally labeled trustworthy: readiness is scoped to a specific use and missing gates fail closed. CCF should preserve this pattern natively.",
  },
  {
    id: "fantasy-context-entity-lineage",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "canonical-identity-bound immutable context versions and observation lineage with fail-closed ambiguity/outage handling and explicit operator attribution",
    sourceEvidence: ["server/modules/contextEntityModel/MODULE.md"],
    scope: "cross_cutting",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF decision-learning/context ledger",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note:
      "Useful for learning from user decisions and preserving rationale. Names must never become identity; updates must append versions/observations rather than rewrite history; outages must never masquerade as empty context.",
  },
  {
    id: "fantasy-post-cutoff-signal-ledger",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "append-only post-cutoff signal ledger with immutable revisions, explicit supersession lineage and corruption-as-error semantics",
    sourceEvidence: ["server/modules/postCutoffLedger/postCutoffLedgerStore.ts"],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF immutable decision/evidence ledger",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note:
      "CCF already has immutable decision-ledger doctrine; this capability makes post-decision/new-information revisions explicit rather than rewriting what the model knew at decision time.",
  },
  {
    id: "fantasy-hypothesis-core",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "provider-neutral immutable hypothesis records, canonical digests, witness-local paper evaluation, explicit wake/no-op rules and authority-bound append proposals",
    sourceEvidence: [
      "server/modules/hypothesisCore/MODULE.md",
      "server/modules/hypothesisCore/canonicalization.ts",
      "server/modules/hypothesisCore/conformance.ts",
    ],
    scope: "cross_cutting",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF research/challenger governance",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "chronological_oos", "tiber_off"],
    note:
      "Use this to govern feature/model hypotheses before promotion. Missing/unavailable evidence must not weaken a hypothesis unless a predeclared absence rule with complete governed coverage allows it.",
  },
  {
    id: "fantasy-doctrine-insulation-market",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "higher-order asset-insulation and league-relative market-position reasoning over role security, efficiency durability, team dependency and positional peer context",
    sourceEvidence: [
      "server/doctrine/asset_insulation_model.ts",
      "server/doctrine/league_market_model.ts",
    ],
    scope: "decision_value",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF risk/fragility + league market/value layer",
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
      "Preserve asset-insulation and league-relative mispricing questions, but reject the old neutral-default behavior, fixed position modifiers, hand-set weights, FORGE-tier mapping and Alpha-derived market proxy as native truth.",
  },
  {
    id: "fantasy-catalyst-leverage-context",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "play-level leverage/context hypothesis using EPA, WPA leverage, opponent difficulty, game script and recency",
    sourceEvidence: ["server/modules/catalyst/MODULE.md", "server/modules/catalyst/catalystCalculator.py"],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF experimental feature/challenger lane",
    requiredForUniversalCCF: false,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "chronological_oos", "ablation", "tiber_off"],
    note:
      "The mechanism is a testable feature hypothesis, not a score to copy. The old minimum-play cutoff, decay, role multipliers, leverage sigmoid, opponent multiplier and script boost are hand-set and must not enter native authority without independent evidence.",
  },
  {
    id: "fantasy-draft-context-compiler",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability:
      "deterministic league/draft/roster context compiler with reserve capacity, draft-board/turn-distance counterfactuals and explicit unavailable states",
    sourceEvidence: ["server/modules/draftReview/MODULE.md", "server/modules/draftReview/draftReviewService.ts"],
    scope: "decision_value",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF league truth + Draft-Day decision context",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note:
      "CCF already owns league/scoring/roster truth and Draft-Day context foundations; preserve the deterministic capacity/counterfactual/unavailable-state mechanics while binding them to CCF-native platform data.",
  },
  {
    id: "fantasy-legacy-composite-brains",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability: "OVR, PlayerCompass and hardcoded dynasty composite/valuation brains",
    sourceEvidence: [
      "docs/architecture/TIBER_FANTASY_MODULE_CLASSIFICATION_AUDIT.md",
      "server/modules/ovr/**",
      "server/services/playerCompassService.ts",
      "server/dynastyScoringAlgorithm.ts",
    ],
    scope: "decision_value",
    disposition: "intentionally_retire",
    status: "intentionally_retired",
    ccfOwner: "CCF research archive",
    requiredForUniversalCCF: false,
    promotionEvidenceRequired: [],
    note:
      "Do not preserve overlapping composite outputs merely for parity. Any useful underlying signal must earn entry through CCF feature/model validation; duplicate final grades/ratings/heuristic valuations are retired.",
  },
] as const;
